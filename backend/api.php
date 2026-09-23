<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/integrations.php';

$action = strtolower(trim((string) ($_GET['action'] ?? 'health')));
$pdo = in_array($action, ['health', 'config'], true) ? null : db();

switch ($action) {
    case 'health':
        jsonResponse([
            'success' => true,
            'message' => 'RoadPass Revizyon 4 API çalışıyor.',
            'app' => env('APP_NAME', 'RoadPass'),
            'revision' => 4,
            'time' => date(DATE_ATOM),
        ]);

    case 'config':
        requireMethod('GET');
        jsonResponse([
            'success' => true,
            'config' => [
                'openai_enabled' => trim((string) env('OPENAI_API_KEY', '')) !== '',
                'openai_web_search' => boolEnv('OPENAI_WEB_SEARCH', false),
                'demo_payments' => boolEnv('DEMO_PAYMENTS', true),
                'hgs_tag_min_length' => (int) env('HGS_TAG_MIN_LENGTH', 6),
                'hgs_tag_max_length' => (int) env('HGS_TAG_MAX_LENGTH', 32),
            ],
        ]);

    case 'register':
        requireMethod('POST');
        $data = requestData();
        $name = trim((string) ($data['name'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');

        if (mb_strlen($name) < 3 || !validateEmail($email) || mb_strlen($password) < 8) {
            jsonResponse(['success' => false, 'message' => 'Ad soyad, geçerli e-posta ve en az 8 karakterli şifre gereklidir.'], 422);
        }

        $exists = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $exists->execute([$email]);
        if ($exists->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Bu e-posta adresi zaten kayıtlı.'], 409);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('INSERT INTO users (full_name, phone, email, password_hash, status) VALUES (?, ?, ?, ?, "active")');
            $stmt->execute([$name, $phone, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO hgs_accounts (user_id, label, balance, auto_topup, auto_topup_amount, low_balance_limit) VALUES (?, "Ana HGS Hesabı", 0, 0, 500, 250)')->execute([$userId]);
            $pdo->prepare('INSERT INTO user_settings (user_id, theme, language, push_enabled, email_enabled) VALUES (?, "dark", "tr", 1, 1)')->execute([$userId]);
            $pdo->prepare('INSERT INTO notifications (user_id, type, title, message, is_read) VALUES (?, "welcome", "RoadPass’e hoş geldiniz", "Araç ekleyerek akıllı yolculuk deneyiminizi başlatabilirsiniz.", 0)')->execute([$userId]);
            $pdo->prepare('INSERT INTO ai_messages (user_id, role, content, mode) VALUES (?, "assistant", "Merhaba! RoadPass bakiyeniz, geçişleriniz, araçlarınız ve uygulama kullanımı hakkında yardımcı olabilirim.", "system-welcome")')->execute([$userId]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        jsonResponse(['success' => true, 'message' => 'Kayıt tamamlandı.', 'user_id' => $userId], 201);

    case 'login':
        requireMethod('POST');
        $data = requestData();
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $stmt = $pdo->prepare('SELECT u.id, u.full_name, u.email, u.password_hash, u.status, COALESCE(s.language,"tr") AS language, COALESCE(s.premium_theme_enabled,1) AS premium_theme_enabled, COALESCE(s.simple_mode,0) AS simple_mode, COALESCE(s.large_text,0) AS large_text, COALESCE(s.accent_theme,"aurora") AS accent_theme FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user || $user['status'] !== 'active' || !password_verify($password, $user['password_hash'])) {
            jsonResponse(['success' => false, 'message' => 'E-posta veya şifre hatalı.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $user['id'];
        jsonResponse([
            'success' => true,
            'message' => 'Giriş başarılı.',
            'user' => ['id' => (int) $user['id'], 'name' => $user['full_name'], 'email' => $user['email'], 'language' => $user['language']],
        ]);

    case 'logout':
        requireMethod('POST');
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
        jsonResponse(['success' => true, 'message' => 'Oturum kapatıldı.']);

    case 'me':
        requireMethod('GET');
        $userId = requireAuth();
        $stmt = $pdo->prepare('SELECT u.id, u.role, u.full_name, u.phone, u.email, u.profile_photo, u.created_at, COALESCE(s.language,"tr") AS language, COALESCE(s.premium_theme_enabled,1) AS premium_theme_enabled, COALESCE(s.simple_mode,0) AS simple_mode, COALESCE(s.large_text,0) AS large_text, COALESCE(s.accent_theme,"aurora") AS accent_theme FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        $user['membership'] = activeSubscription($pdo, $userId) ? 'premium' : 'standard';
        jsonResponse(['success' => true, 'user' => $user]);

    case 'dashboard':
        requireMethod('GET');
        $userId = requireAuth();
        $language = userLanguage($pdo, $userId);

        $balanceStmt = $pdo->prepare('SELECT COALESCE(SUM(balance),0) FROM hgs_accounts WHERE user_id=?');
        $balanceStmt->execute([$userId]);
        $balance = (float)$balanceStmt->fetchColumn();

        $monthStmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) total,COUNT(*) passage_count FROM passages WHERE user_id=? AND deleted_at IS NULL AND passed_at>=DATE_FORMAT(CURRENT_DATE,"%Y-%m-01")');
        $monthStmt->execute([$userId]);
        $monthData = $monthStmt->fetch() ?: ['total'=>0,'passage_count'=>0];
        $monthSpend = (float)$monthData['total'];
        $monthPassageCount = (int)$monthData['passage_count'];

        $weekStmt = $pdo->prepare('SELECT COUNT(*) FROM passages WHERE user_id=? AND deleted_at IS NULL AND passed_at>=DATE_SUB(NOW(),INTERVAL 7 DAY)');
        $weekStmt->execute([$userId]);
        $weekCount = (int)$weekStmt->fetchColumn();

        $vehicleStmt = $pdo->prepare('SELECT COUNT(*) FROM vehicles WHERE user_id=?');
        $vehicleStmt->execute([$userId]);
        $vehicleCount = (int)$vehicleStmt->fetchColumn();

        $recentStmt = $pdo->prepare('SELECT p.id,p.location,p.road_name,p.amount,p.passed_at,v.plate FROM passages p LEFT JOIN vehicles v ON v.id=p.vehicle_id WHERE p.user_id=? AND p.deleted_at IS NULL ORDER BY p.passed_at DESC LIMIT 5');
        $recentStmt->execute([$userId]);

        $trendStmt = $pdo->prepare('SELECT DATE(passed_at) day,ROUND(SUM(amount),2) total FROM passages WHERE user_id=? AND deleted_at IS NULL AND passed_at>=DATE_SUB(CURRENT_DATE,INTERVAL 6 DAY) GROUP BY DATE(passed_at) ORDER BY day');
        $trendStmt->execute([$userId]);
        $trendMap=[]; foreach($trendStmt->fetchAll() as $row) $trendMap[$row['day']] = (float)$row['total'];
        $trend=[]; for($i=6;$i>=0;$i--){$date=date('Y-m-d',strtotime("-{$i} day"));$trend[]=['day'=>date('D',strtotime($date)),'date'=>$date,'total'=>$trendMap[$date]??0];}

        $averageStmt=$pdo->prepare('SELECT COALESCE(AVG(amount),0) FROM passages WHERE user_id=? AND deleted_at IS NULL AND passed_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)');
        $averageStmt->execute([$userId]); $averagePassage=(float)$averageStmt->fetchColumn();
        $elapsedDays=max((int)date('j'),1); $daysInMonth=(int)date('t');
        $dailyAverage=$monthSpend/$elapsedDays; $projectedMonthSpend=round($dailyAverage*$daysInMonth,2);
        $estimatedDays=$dailyAverage>0.01?(int)floor($balance/$dailyAverage):null;
        $estimatedPassages=$averagePassage>0.01?(int)floor($balance/$averagePassage):null;
        $recommendedTopup=max(0,$projectedMonthSpend-$balance); if($balance<300)$recommendedTopup=max($recommendedTopup,500-$balance); $recommendedTopup=$recommendedTopup>0?ceil($recommendedTopup/50)*50:0;

        $risk='normal';
        $headline=localized('Bakiyeniz kontrol altında','Your balance is under control',$language);
        $riskMessage=localized('Mevcut kullanım hızınıza göre yakın vadede kritik bakiye riski görünmüyor.','Your current usage rate does not show a critical near-term balance risk.',$language);
        if($balance<250||($estimatedDays!==null&&$estimatedDays<4)){
            $risk='high';$headline=localized('Yola çıkmadan önce bakiyeyi kontrol edin','Check your balance before travelling',$language);$riskMessage=localized('RoadPass bakiyeniz düşük görünüyor. Gerçek HGS bakiyenizi PTT veya bankanızdan doğrulayın.','Your RoadPass balance looks low. Verify your official HGS balance through PTT or your bank.',$language);
        }elseif(($estimatedDays!==null&&$estimatedDays<8)||$balance<max(300,$dailyAverage*7)){
            $risk='medium';$headline=localized('Bu hafta bakiyenizi takip edin','Keep an eye on your balance this week',$language);$riskMessage=localized('Mevcut kullanım hızınıza göre bir hafta içinde yükleme gerekebilir.','At your current usage rate, you may need a top-up within a week.',$language);
        }

        $expenseMonthStmt=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM vehicle_expenses WHERE user_id=? AND expense_date>=DATE_FORMAT(CURRENT_DATE,"%Y-%m-01")');
        $expenseMonthStmt->execute([$userId]); $vehicleExpenseMonth=(float)$expenseMonthStmt->fetchColumn();
        $expenseForecastStmt=$pdo->prepare('SELECT category,ROUND(SUM(amount)/3,2) monthly_average FROM vehicle_expenses WHERE user_id=? AND expense_date>=DATE_SUB(CURRENT_DATE,INTERVAL 90 DAY) GROUP BY category ORDER BY monthly_average DESC');
        $expenseForecastStmt->execute([$userId]); $forecastCategories=$expenseForecastStmt->fetchAll();
        $vehicleForecast=0.0; foreach($forecastCategories as $category) $vehicleForecast += (float)$category['monthly_average'];
        $forecast30=round($projectedMonthSpend+$vehicleForecast,2);

        $reminderStmt=$pdo->prepare('SELECT r.id,r.reminder_type,r.title,r.due_date,DATEDIFF(r.due_date,CURRENT_DATE) days_left,v.plate FROM vehicle_reminders r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.user_id=? AND r.is_completed=0 ORDER BY r.due_date ASC LIMIT 6');
        $reminderStmt->execute([$userId]); $upcomingReminders=$reminderStmt->fetchAll();
        $officialLinks=[
            'inspection'=>'https://www.turkiye.gov.tr/muayene-randevu-kayit',
            'insurance'=>'https://www.turkiye.gov.tr/trafik-police-ve-hasar-bilgileri-sorgulama',
            'tax'=>'https://ivd.gib.gov.tr/',
            'maintenance'=>'https://www.google.com/maps/search/oto+servisi/',
            'tire'=>'https://www.google.com/maps/search/lastik+servisi/',
            'other'=>'https://www.turkiye.gov.tr/',
        ];
        foreach($upcomingReminders as &$reminder){$reminder['action_url']=$officialLinks[$reminder['reminder_type']]??$officialLinks['other'];$reminder['action_label']=$reminder['reminder_type']==='inspection'?localized('Randevu Al','Book Appointment',$language):localized('Resmî İşleme Git','Open Official Service',$language);} unset($reminder);

        $score=100;
        if($vehicleCount===0)$score-=25;
        if($risk==='high')$score-=25; elseif($risk==='medium')$score-=10;
        $reminderPenalty=0;
        foreach($upcomingReminders as $r){$days=(int)$r['days_left'];if($days<0)$reminderPenalty+=18;elseif($days<=7)$reminderPenalty+=12;elseif($days<=30)$reminderPenalty+=5;}
        $score=max(0,min(100,$score-min(35,$reminderPenalty)));
        $scoreStatus=$score>=80?'ready':($score>=55?'attention':'action');
        $scoreLabel=match($scoreStatus){'ready'=>localized('Hazırsınız','You are ready',$language),'attention'=>localized('Birkaç noktayı kontrol edin','Check a few items',$language),default=>localized('İşlem gerekiyor','Action required',$language)};

        $actions=[];
        if($vehicleCount===0)$actions[]=['type'=>'vehicle','title'=>localized('İlk aracınızı ekleyin','Add your first vehicle',$language),'detail'=>localized('Plaka, marka ve model yeterli.','Plate, brand, and model are enough.',$language),'action'=>'vehicles'];
        if($risk==='high'||$recommendedTopup>0)$actions[]=['type'=>'wallet','title'=>localized('HGS bakiyesini doğrulayın','Verify your HGS balance',$language),'detail'=>localized('Önerilen RoadPass yüklemesi: ','Suggested RoadPass top-up: ',$language).money((float)$recommendedTopup),'action'=>'wallet','external_url'=>'https://hgsmusteri.ptt.gov.tr/'];
        foreach(array_slice($upcomingReminders,0,3) as $r){$actions[]=['type'=>'reminder','title'=>$r['title'],'detail'=>$r['plate'].' · '.($r['days_left']<0?localized('Tarihi geçti','Overdue',$language):$r['days_left'].' '.localized('gün kaldı','days left',$language)),'action'=>'vehicles','external_url'=>$r['action_url'],'external_label'=>$r['action_label']];}
        if($actions===[])$actions[]=['type'=>'ready','title'=>localized('Bugün için kritik işlem yok','No critical action today',$language),'detail'=>localized('Bakiyeniz ve yaklaşan tarihleriniz kontrol altında.','Your balance and upcoming dates are under control.',$language),'action'=>'route'];

        $subscription=activeSubscription($pdo,$userId);
        jsonResponse([
            'success'=>true,
            'metrics'=>['balance'=>$balance,'month_spend'=>$monthSpend,'week_passages'=>$weekCount,'vehicle_count'=>$vehicleCount],
            'recent_passages'=>$recentStmt->fetchAll(),'trend'=>$trend,
            'ai_insight'=>['risk'=>$risk,'message'=>$riskMessage],
            'balance_analysis'=>['risk'=>$risk,'headline'=>$headline,'message'=>$riskMessage,'daily_average'=>round($dailyAverage,2),'average_passage'=>round($averagePassage,2),'estimated_days'=>$estimatedDays,'estimated_passages'=>$estimatedPassages,'projected_month_spend'=>$projectedMonthSpend,'recommended_topup'=>$recommendedTopup,'month_passage_count'=>$monthPassageCount],
            'membership'=>$subscription?'premium':'standard','vehicle_expense_month'=>$vehicleExpenseMonth,'upcoming_reminders'=>$upcomingReminders,
            'readiness'=>['score'=>$score,'status'=>$scoreStatus,'label'=>$scoreLabel,'actions'=>array_slice($actions,0,4)],
            'forecast'=>['days'=>30,'hgs'=>round($projectedMonthSpend,2),'vehicle_expenses'=>round($vehicleForecast,2),'total'=>$forecast30,'categories'=>$forecastCategories,'is_estimate'=>true,'based_on_days'=>90],
        ]);

    case 'vehicle_catalog':
        requireMethod('GET');
        requireAuth();
        $typeId = (int) ($_GET['type_id'] ?? 0);
        $brandId = (int) ($_GET['brand_id'] ?? 0);
        $types = $pdo->query('SELECT id, code, name_tr, name_en, hgs_class FROM vehicle_types WHERE is_active=1 ORDER BY sort_order, id')->fetchAll();
        $brands = [];
        $models = [];
        if ($typeId > 0) {
            $stmt = $pdo->prepare('SELECT id, vehicle_type_id, name FROM vehicle_brands WHERE vehicle_type_id=? AND is_active=1 ORDER BY name');
            $stmt->execute([$typeId]);
            $brands = $stmt->fetchAll();
        }
        if ($brandId > 0) {
            $stmt = $pdo->prepare('SELECT id, brand_id, name FROM vehicle_models WHERE brand_id=? AND is_active=1 ORDER BY name');
            $stmt->execute([$brandId]);
            $models = $stmt->fetchAll();
        }
        jsonResponse(['success' => true, 'types' => $types, 'brands' => $brands, 'models' => $models]);

    case 'vehicles':
        $userId = requireAuth();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $pdo->prepare('SELECT v.id,v.vehicle_type_id,v.brand_id,v.model_id,COALESCE(vb.name,v.brand) AS brand,COALESCE(vm.name,v.model) AS model,v.plate,v.color,COALESCE(vt.name_tr,v.vehicle_type) AS vehicle_type,vt.name_en AS vehicle_type_en,vt.code AS vehicle_type_code,vt.hgs_class,v.hgs_tag,v.is_default,v.manufacture_year,v.body_type,v.fuel_type,v.transmission,v.engine_label,v.average_consumption,v.tank_capacity,v.battery_capacity,v.current_fuel_liters,v.current_charge_percent,v.created_at FROM vehicles v LEFT JOIN vehicle_types vt ON vt.id=v.vehicle_type_id LEFT JOIN vehicle_brands vb ON vb.id=v.brand_id LEFT JOIN vehicle_models vm ON vm.id=v.model_id WHERE v.user_id=? ORDER BY v.is_default DESC,v.created_at DESC');
            $stmt->execute([$userId]);
            jsonResponse(['success'=>true,'vehicles'=>$stmt->fetchAll()]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data=requestData();
            $typeId=(int)($data['vehicle_type_id']??0); $brandId=(int)($data['brand_id']??0); $modelId=(int)($data['model_id']??0);
            $customModel=trim((string)($data['custom_model_name']??''));
            $plateRaw=(string)($data['plate']??''); $color=trim((string)($data['color']??''));
            $hgsTag=normalizeHgsTag((string)($data['hgs_tag']??'')); $isDefault=!empty($data['is_default'])?1:0;
            $year=(int)($data['manufacture_year']??0); $bodyType=trim((string)($data['body_type']??''));
            $fuelType=(string)($data['fuel_type']??'gasoline'); $transmission=(string)($data['transmission']??'');
            $engineLabel=trim((string)($data['engine_label']??''));
            $averageConsumption=($data['average_consumption']??'')===''?null:(float)$data['average_consumption'];
            $tankCapacity=($data['tank_capacity']??'')===''?null:(float)$data['tank_capacity'];
            $batteryCapacity=($data['battery_capacity']??'')===''?null:(float)$data['battery_capacity'];
            $currentFuel=($data['current_fuel_liters']??'')===''?null:(float)$data['current_fuel_liters'];
            $currentCharge=($data['current_charge_percent']??'')===''?null:(float)$data['current_charge_percent'];
            $fuelTypes=['gasoline','diesel','lpg','hybrid','electric','other']; $transmissions=['manual','automatic','semi_automatic','other',''];
            if(!validateTurkishPlate($plateRaw)) jsonResponse(['success'=>false,'message'=>'Plaka biçimi geçersiz. İl kodu 01–81 olmalı; harf ve rakam gruplarını kontrol edin.'],422);
            if(!validateHgsTag($hgsTag)){ $min=(int)env('HGS_TAG_MIN_LENGTH',6);$max=(int)env('HGS_TAG_MAX_LENGTH',32);jsonResponse(['success'=>false,'message'=>"HGS etiketi {$min}–{$max} karakter olmalı ve yalnızca harf, rakam veya tire içermelidir."],422); }
            if(!in_array($fuelType,$fuelTypes,true)||!in_array($transmission,$transmissions,true)) jsonResponse(['success'=>false,'message'=>'Yakıt veya şanzıman seçimi geçersiz.'],422);
            if($year!==0&&($year<1950||$year>(int)date('Y')+1)) jsonResponse(['success'=>false,'message'=>'Üretim yılı geçersiz.'],422);
            foreach([['value'=>$averageConsumption,'max'=>100],['value'=>$tankCapacity,'max'=>500],['value'=>$batteryCapacity,'max'=>500],['value'=>$currentFuel,'max'=>500],['value'=>$currentCharge,'max'=>100]] as $numeric){ if($numeric['value']!==null&&($numeric['value']<0||$numeric['value']>$numeric['max'])) jsonResponse(['success'=>false,'message'=>'Araç tüketim veya enerji bilgisi geçersiz.'],422); }
            $catalog=$pdo->prepare('SELECT vt.id AS type_id,vt.name_tr AS type_name,vb.id AS brand_id,vb.name AS brand_name FROM vehicle_types vt JOIN vehicle_brands vb ON vb.vehicle_type_id=vt.id WHERE vt.id=? AND vb.id=? AND vt.is_active=1 AND vb.is_active=1 LIMIT 1');
            $catalog->execute([$typeId,$brandId]); $selected=$catalog->fetch();
            if(!$selected) jsonResponse(['success'=>false,'message'=>'Araç tipi ve marka eşleşmesi geçersiz.'],422);
            $modelName='';
            if($modelId>0){ $modelStmt=$pdo->prepare('SELECT id,name FROM vehicle_models WHERE id=? AND brand_id=? AND is_active=1 LIMIT 1');$modelStmt->execute([$modelId,$brandId]);$modelRow=$modelStmt->fetch();if(!$modelRow)jsonResponse(['success'=>false,'message'=>'Seçilen model bu markaya ait değil.'],422);$modelName=(string)$modelRow['name']; }
            else { if(mb_strlen($customModel)<2||mb_strlen($customModel)>120)jsonResponse(['success'=>false,'message'=>'Katalogda olmayan model için 2–120 karakterlik model adı girin.'],422);$modelName=$customModel; }
            $plate=formatTurkishPlate($plateRaw);
            $exists=$pdo->prepare('SELECT id FROM vehicles WHERE user_id=? AND plate=? LIMIT 1');$exists->execute([$userId,$plate]);if($exists->fetch())jsonResponse(['success'=>false,'message'=>'Bu plaka zaten kayıtlı.'],409);
            if($hgsTag!==''){ $exists=$pdo->prepare('SELECT id FROM vehicles WHERE user_id=? AND hgs_tag=? LIMIT 1');$exists->execute([$userId,$hgsTag]);if($exists->fetch())jsonResponse(['success'=>false,'message'=>'Bu HGS etiketi başka bir aracınızda kayıtlı.'],409); }
            $countStmt=$pdo->prepare('SELECT COUNT(*) FROM vehicles WHERE user_id=?');$countStmt->execute([$userId]);$vehicleCount=(int)$countStmt->fetchColumn();$maxVehicles=activeSubscription($pdo,$userId)?10:2;
            if($vehicleCount>=$maxVehicles)jsonResponse(['success'=>false,'message'=>'Araç limitinize ulaştınız. Daha fazla araç için RoadPass Premium’u inceleyin.'],403);if($vehicleCount===0)$isDefault=1;
            $pdo->beginTransaction();
            try{
                if($isDefault)$pdo->prepare('UPDATE vehicles SET is_default=0 WHERE user_id=?')->execute([$userId]);
                $stmt=$pdo->prepare('INSERT INTO vehicles (user_id,vehicle_type_id,brand_id,model_id,brand,model,plate,color,vehicle_type,hgs_tag,is_default,manufacture_year,body_type,fuel_type,transmission,engine_label,average_consumption,tank_capacity,battery_capacity,current_fuel_liters,current_charge_percent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
                $stmt->execute([$userId,$typeId,$brandId,$modelId>0?$modelId:null,$selected['brand_name'],$modelName,$plate,$color,$selected['type_name'],$hgsTag!==''?$hgsTag:null,$isDefault,$year?:null,$bodyType?:null,$fuelType,$transmission?:null,$engineLabel?:null,$averageConsumption,$fuelType==='electric'?null:$tankCapacity,$fuelType==='electric'?$batteryCapacity:null,$fuelType==='electric'?null:$currentFuel,$fuelType==='electric'?$currentCharge:null]);
                $id=(int)$pdo->lastInsertId();
                if($modelId===0){ $dup=$pdo->prepare('SELECT id FROM vehicle_model_suggestions WHERE brand_id=? AND LOWER(model_name)=LOWER(?) AND status="pending" LIMIT 1');$dup->execute([$brandId,$customModel]);if(!$dup->fetch())$pdo->prepare('INSERT INTO vehicle_model_suggestions (user_id,vehicle_type_id,brand_id,model_name,manufacture_year,fuel_type,body_type,status) VALUES (?,?,?,?,?,?,?,"pending")')->execute([$userId,$typeId,$brandId,$customModel,$year?:null,$fuelType,$bodyType?:null]); }
                $pdo->commit();
            }catch(Throwable $e){$pdo->rollBack();throw $e;}
            jsonResponse(['success'=>true,'message'=>'Araç eklendi.','id'=>$id,'custom_model'=>$modelId===0],201);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $vehicleId=(int)($_GET['id']??0);$check=$pdo->prepare('SELECT is_default FROM vehicles WHERE id=? AND user_id=?');$check->execute([$vehicleId,$userId]);$vehicle=$check->fetch();if(!$vehicle)jsonResponse(['success'=>false,'message'=>'Araç bulunamadı.'],404);
            $pdo->beginTransaction();try{$pdo->prepare('DELETE FROM vehicles WHERE id=? AND user_id=?')->execute([$vehicleId,$userId]);if((int)$vehicle['is_default']===1)$pdo->prepare('UPDATE vehicles SET is_default=1 WHERE user_id=? ORDER BY created_at ASC LIMIT 1')->execute([$userId]);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}
            jsonResponse(['success'=>true,'message'=>'Araç silindi.']);
        }
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'vehicle_model_suggestions':
        $userId=requireAuth();$language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){$stmt=$pdo->prepare('SELECT s.id,s.model_name,s.manufacture_year,s.fuel_type,s.body_type,s.status,s.admin_note,s.created_at,b.name AS brand,vt.name_tr AS vehicle_type_tr,vt.name_en AS vehicle_type_en FROM vehicle_model_suggestions s JOIN vehicle_brands b ON b.id=s.brand_id JOIN vehicle_types vt ON vt.id=s.vehicle_type_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 30');$stmt->execute([$userId]);jsonResponse(['success'=>true,'suggestions'=>$stmt->fetchAll()]);}
        if($_SERVER['REQUEST_METHOD']==='POST'){$data=requestData();$typeId=(int)($data['vehicle_type_id']??0);$brandId=(int)($data['brand_id']??0);$name=trim((string)($data['model_name']??''));$year=(int)($data['manufacture_year']??0);$fuel=trim((string)($data['fuel_type']??''));$body=trim((string)($data['body_type']??''));if(mb_strlen($name)<2||mb_strlen($name)>120)jsonResponse(['success'=>false,'message'=>localized('Model adı 2–120 karakter olmalıdır.','Model name must be 2–120 characters.',$language)],422);$check=$pdo->prepare('SELECT b.id FROM vehicle_brands b WHERE b.id=? AND b.vehicle_type_id=? AND b.is_active=1');$check->execute([$brandId,$typeId]);if(!$check->fetch())jsonResponse(['success'=>false,'message'=>localized('Marka ve araç tipi eşleşmesi geçersiz.','Brand and vehicle type do not match.',$language)],422);$existing=$pdo->prepare('SELECT id FROM vehicle_models WHERE brand_id=? AND LOWER(name)=LOWER(?) LIMIT 1');$existing->execute([$brandId,$name]);if($existing->fetch())jsonResponse(['success'=>false,'message'=>localized('Bu model katalogda zaten bulunuyor.','This model already exists in the catalogue.',$language)],409);$dup=$pdo->prepare('SELECT id,status FROM vehicle_model_suggestions WHERE user_id=? AND brand_id=? AND LOWER(model_name)=LOWER(?) ORDER BY id DESC LIMIT 1');$dup->execute([$userId,$brandId,$name]);if($row=$dup->fetch())jsonResponse(['success'=>true,'message'=>localized('Öneriniz zaten kayıtlı.','Your suggestion is already recorded.',$language),'id'=>(int)$row['id'],'status'=>$row['status']]);$stmt=$pdo->prepare('INSERT INTO vehicle_model_suggestions (user_id,vehicle_type_id,brand_id,model_name,manufacture_year,fuel_type,body_type,status) VALUES (?,?,?,?,?,?,?,"pending")');$stmt->execute([$userId,$typeId,$brandId,$name,$year?:null,$fuel?:null,$body?:null]);jsonResponse(['success'=>true,'message'=>localized('Model öneriniz incelemeye gönderildi. Aracınızda özel model olarak kullanabilirsiniz.','Your model suggestion was submitted for review and can be used as a custom model on your vehicle.',$language),'id'=>(int)$pdo->lastInsertId(),'status'=>'pending'],201);}
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'addresses':
        $userId=requireAuth();$language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){$stmt=$pdo->prepare('SELECT id,label,address_type,province,district,neighborhood,street,building_no,full_address,latitude,longitude,is_default_origin,created_at FROM saved_addresses WHERE user_id=? ORDER BY is_default_origin DESC,created_at DESC');$stmt->execute([$userId]);jsonResponse(['success'=>true,'addresses'=>$stmt->fetchAll()]);}
        if($_SERVER['REQUEST_METHOD']==='POST'){$data=requestData();$label=trim((string)($data['label']??''));$type=in_array(($data['address_type']??'other'),['home','work','other'],true)?(string)$data['address_type']:'other';$province=trim((string)($data['province']??''));$district=trim((string)($data['district']??''));$neighborhood=trim((string)($data['neighborhood']??''));$street=trim((string)($data['street']??''));$building=trim((string)($data['building_no']??''));$full=trim((string)($data['full_address']??''));$lat=($data['latitude']??'')===''?null:(float)$data['latitude'];$lng=($data['longitude']??'')===''?null:(float)$data['longitude'];$default=!empty($data['is_default_origin'])?1:0;if(mb_strlen($label)<2||mb_strlen($full)<8||mb_strlen($full)>500)jsonResponse(['success'=>false,'message'=>localized('Adres etiketi ve açık adres bilgisi gereklidir.','Address label and full address are required.',$language)],422);$pdo->beginTransaction();try{if($default)$pdo->prepare('UPDATE saved_addresses SET is_default_origin=0 WHERE user_id=?')->execute([$userId]);$stmt=$pdo->prepare('INSERT INTO saved_addresses (user_id,label,address_type,province,district,neighborhood,street,building_no,full_address,latitude,longitude,is_default_origin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');$stmt->execute([$userId,$label,$type,$province?:null,$district?:null,$neighborhood?:null,$street?:null,$building?:null,$full,$lat,$lng,$default]);$id=(int)$pdo->lastInsertId();$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}jsonResponse(['success'=>true,'message'=>localized('Adres kaydedildi.','Address saved.',$language),'id'=>$id],201);}
        if($_SERVER['REQUEST_METHOD']==='DELETE'){$id=(int)($_GET['id']??0);$pdo->prepare('DELETE FROM saved_addresses WHERE id=? AND user_id=?')->execute([$id,$userId]);jsonResponse(['success'=>true,'message'=>localized('Adres silindi.','Address deleted.',$language)]);}
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'vehicle_expenses':
        $userId=requireAuth();$language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){$stmt=$pdo->prepare('SELECT e.id,e.vehicle_id,e.category,e.amount,e.odometer_km,e.description,e.expense_date,e.created_at,v.plate,v.brand,v.model FROM vehicle_expenses e JOIN vehicles v ON v.id=e.vehicle_id WHERE e.user_id=? ORDER BY e.expense_date DESC,e.id DESC LIMIT 100');$stmt->execute([$userId]);$rows=$stmt->fetchAll();$sum=$pdo->prepare('SELECT category,ROUND(SUM(amount),2) total FROM vehicle_expenses WHERE user_id=? AND expense_date>=DATE_FORMAT(CURRENT_DATE,"%Y-%m-01") GROUP BY category ORDER BY total DESC');$sum->execute([$userId]);$total=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM vehicle_expenses WHERE user_id=? AND expense_date>=DATE_FORMAT(CURRENT_DATE,"%Y-%m-01")');$total->execute([$userId]);jsonResponse(['success'=>true,'expenses'=>$rows,'category_totals'=>$sum->fetchAll(),'month_total'=>(float)$total->fetchColumn()]);}
        if($_SERVER['REQUEST_METHOD']==='POST'){$data=requestData();$vehicleId=(int)($data['vehicle_id']??0);$category=(string)($data['category']??'other');$amount=(float)($data['amount']??0);$odometer=($data['odometer_km']??'')===''?null:(int)$data['odometer_km'];$description=trim((string)($data['description']??''));$date=(string)($data['expense_date']??date('Y-m-d'));$categories=['fuel','maintenance','insurance','inspection','parking','wash','tax','other'];if(!in_array($category,$categories,true)||$amount<=0||$amount>1000000||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date))jsonResponse(['success'=>false,'message'=>localized('Gider bilgileri geçersiz.','Expense details are invalid.',$language)],422);$v=$pdo->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$v->execute([$vehicleId,$userId]);if(!$v->fetch())jsonResponse(['success'=>false,'message'=>localized('Araç bulunamadı.','Vehicle not found.',$language)],404);$stmt=$pdo->prepare('INSERT INTO vehicle_expenses (user_id,vehicle_id,category,amount,odometer_km,description,expense_date) VALUES (?,?,?,?,?,?,?)');$stmt->execute([$userId,$vehicleId,$category,$amount,$odometer,$description?:null,$date]);jsonResponse(['success'=>true,'message'=>localized('Araç gideri kaydedildi.','Vehicle expense saved.',$language),'id'=>(int)$pdo->lastInsertId()],201);}
        if($_SERVER['REQUEST_METHOD']==='DELETE'){$id=(int)($_GET['id']??0);$pdo->prepare('DELETE FROM vehicle_expenses WHERE id=? AND user_id=?')->execute([$id,$userId]);jsonResponse(['success'=>true,'message'=>localized('Gider silindi.','Expense deleted.',$language)]);}
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'vehicle_reminders':
        $userId=requireAuth();$language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){$stmt=$pdo->prepare('SELECT r.id,r.vehicle_id,r.reminder_type,r.title,r.due_date,r.due_odometer_km,r.is_completed,r.notes,r.created_at,v.plate,v.brand,v.model,DATEDIFF(r.due_date,CURRENT_DATE) AS days_left FROM vehicle_reminders r JOIN vehicles v ON v.id=r.vehicle_id WHERE r.user_id=? ORDER BY r.is_completed ASC,r.due_date ASC LIMIT 100');$stmt->execute([$userId]);jsonResponse(['success'=>true,'reminders'=>$stmt->fetchAll()]);}
        if($_SERVER['REQUEST_METHOD']==='POST'){$data=requestData();$operation=(string)($data['operation']??'create');if($operation==='complete'){$id=(int)($data['id']??0);$done=!empty($data['is_completed'])?1:0;$pdo->prepare('UPDATE vehicle_reminders SET is_completed=? WHERE id=? AND user_id=?')->execute([$done,$id,$userId]);jsonResponse(['success'=>true,'message'=>localized('Hatırlatıcı güncellendi.','Reminder updated.',$language)]);} $vehicleId=(int)($data['vehicle_id']??0);$type=(string)($data['reminder_type']??'other');$title=trim((string)($data['title']??''));$date=(string)($data['due_date']??'');$km=($data['due_odometer_km']??'')===''?null:(int)$data['due_odometer_km'];$notes=trim((string)($data['notes']??''));$types=['inspection','insurance','maintenance','tax','tire','other'];if(!in_array($type,$types,true)||mb_strlen($title)<3||!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date))jsonResponse(['success'=>false,'message'=>localized('Hatırlatıcı bilgileri geçersiz.','Reminder details are invalid.',$language)],422);$v=$pdo->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$v->execute([$vehicleId,$userId]);if(!$v->fetch())jsonResponse(['success'=>false,'message'=>localized('Araç bulunamadı.','Vehicle not found.',$language)],404);$stmt=$pdo->prepare('INSERT INTO vehicle_reminders (user_id,vehicle_id,reminder_type,title,due_date,due_odometer_km,notes) VALUES (?,?,?,?,?,?,?)');$stmt->execute([$userId,$vehicleId,$type,$title,$date,$km,$notes?:null]);jsonResponse(['success'=>true,'message'=>localized('Hatırlatıcı oluşturuldu.','Reminder created.',$language),'id'=>(int)$pdo->lastInsertId()],201);}
        if($_SERVER['REQUEST_METHOD']==='DELETE'){$id=(int)($_GET['id']??0);$pdo->prepare('DELETE FROM vehicle_reminders WHERE id=? AND user_id=?')->execute([$id,$userId]);jsonResponse(['success'=>true,'message'=>localized('Hatırlatıcı silindi.','Reminder deleted.',$language)]);}
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);
    case 'set_default_vehicle':
        requireMethod('POST');
        $userId = requireAuth();
        $data = requestData();
        $vehicleId = (int) ($data['vehicle_id'] ?? 0);
        $check = $pdo->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');
        $check->execute([$vehicleId, $userId]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Araç bulunamadı.'], 404);
        }
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE vehicles SET is_default=0 WHERE user_id=?')->execute([$userId]);
            $pdo->prepare('UPDATE vehicles SET is_default=1 WHERE id=? AND user_id=?')->execute([$vehicleId, $userId]);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        jsonResponse(['success' => true, 'message' => 'Varsayılan araç güncellendi.']);

    case 'passages':
        $userId = requireAuth();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $limit = max(1, min(300, (int) ($_GET['limit'] ?? 100)));
            $trash = !empty($_GET['trash']);
            $condition = $trash ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL';
            $stmt = $pdo->prepare("SELECT p.id,p.location,p.road_name,p.gate_name,p.amount,p.status,p.passed_at,p.deleted_at,v.plate,v.brand,v.model FROM passages p LEFT JOIN vehicles v ON v.id=p.vehicle_id WHERE p.user_id=? AND {$condition} ORDER BY p.passed_at DESC LIMIT {$limit}");
            $stmt->execute([$userId]);
            jsonResponse(['success' => true, 'passages' => $stmt->fetchAll(), 'trash' => $trash]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $data = requestData();
            $mode = (string) ($data['mode'] ?? 'id');
            $ids = [];
            if ($mode === 'all' || $mode === 'last30') {
                $where = $mode === 'last30' ? ' AND passed_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)' : '';
                $idStmt = $pdo->prepare("SELECT id FROM passages WHERE user_id=? AND deleted_at IS NULL{$where}");
                $idStmt->execute([$userId]);
                $ids = array_map('intval', array_column($idStmt->fetchAll(), 'id'));
            } elseif ($mode === 'ids') {
                $rawIds = is_array($data['ids'] ?? null) ? $data['ids'] : [];
                $ids = array_values(array_unique(array_filter(array_map('intval', $rawIds), fn($id) => $id > 0)));
            } else {
                $id = (int) ($data['id'] ?? 0);
                if ($id > 0) $ids = [$id];
            }
            if ($ids === []) jsonResponse(['success'=>false,'message'=>'Silinecek geçiş kaydı seçilmedi.'], 422);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $params = array_merge([$userId], $ids);
            $stmt = $pdo->prepare("UPDATE passages SET deleted_at=NOW() WHERE user_id=? AND deleted_at IS NULL AND id IN ({$placeholders})");
            $stmt->execute($params);
            jsonResponse(['success' => true, 'message' => 'Geçiş kayıtları çöp kutusuna taşındı.', 'affected' => $stmt->rowCount(), 'ids' => $ids]);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    case 'passages_restore':
        requireMethod('POST');
        $userId = requireAuth();
        $data = requestData();
        $mode = (string) ($data['mode'] ?? 'id');
        if ($mode === 'all') {
            $stmt = $pdo->prepare('UPDATE passages SET deleted_at=NULL WHERE user_id=? AND deleted_at IS NOT NULL');
            $stmt->execute([$userId]);
        } else {
            $ids = $mode === 'ids' && is_array($data['ids'] ?? null) ? array_values(array_unique(array_filter(array_map('intval', $data['ids']), fn($id)=>$id>0))) : [(int) ($data['id'] ?? 0)];
            $ids = array_values(array_filter($ids, fn($id)=>$id>0));
            if ($ids === []) jsonResponse(['success'=>false,'message'=>'Geri yüklenecek kayıt seçilmedi.'],422);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("UPDATE passages SET deleted_at=NULL WHERE user_id=? AND deleted_at IS NOT NULL AND id IN ({$placeholders})");
            $stmt->execute(array_merge([$userId], $ids));
        }
        jsonResponse(['success' => true, 'message' => 'Geçiş kayıtları geri yüklendi.', 'affected' => $stmt->rowCount()]);

    case 'wallet':
        $userId = requireAuth();
        $language = userLanguage($pdo, $userId);
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $accountStmt = $pdo->prepare('SELECT id,label,balance,auto_topup,auto_topup_amount,low_balance_limit,provider_reference,updated_at FROM hgs_accounts WHERE user_id=? ORDER BY id LIMIT 1');
            $accountStmt->execute([$userId]);
            $account = $accountStmt->fetch();
            $txStmt = $pdo->prepare('SELECT id,transaction_type,amount,status,payment_method,reference_code,description,is_demo,created_at FROM hgs_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50');
            $txStmt->execute([$userId]);
            jsonResponse([
                'success' => true,
                'account' => $account,
                'transactions' => $txStmt->fetchAll(),
                'demo_payments' => boolEnv('DEMO_PAYMENTS', true),
                'official_topup_url' => 'https://hgsmusteri.ptt.gov.tr/',
                'notice' => localized('RoadPass prototipindeki yüklemeler demo bakiyesini değiştirir; gerçek HGS hesabına para aktarmaz.', 'Top-ups in the RoadPass prototype change only the demo balance; they do not transfer money to a real HGS account.', $language),
            ]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = requestData();
            $operation = (string) ($data['operation'] ?? 'topup');
            $accountStmt = $pdo->prepare('SELECT id,balance FROM hgs_accounts WHERE user_id=? ORDER BY id LIMIT 1');
            $accountStmt->execute([$userId]);
            $account = $accountStmt->fetch();
            if (!$account) {
                jsonResponse(['success' => false, 'message' => 'HGS hesabı bulunamadı.'], 404);
            }
            if ($operation === 'settings') {
                $autoTopup = !empty($data['auto_topup']) ? 1 : 0;
                $autoAmount = max(50, min(5000, (float) ($data['auto_topup_amount'] ?? 500)));
                $lowLimit = max(0, min(5000, (float) ($data['low_balance_limit'] ?? 250)));
                $pdo->prepare('UPDATE hgs_accounts SET auto_topup=?,auto_topup_amount=?,low_balance_limit=? WHERE id=? AND user_id=?')->execute([$autoTopup, $autoAmount, $lowLimit, $account['id'], $userId]);
                jsonResponse(['success' => true, 'message' => 'Cüzdan ayarları güncellendi.']);
            }
            if (!boolEnv('DEMO_PAYMENTS', true)) {
                jsonResponse(['success' => false, 'message' => 'Demo ödeme sistemi kapalı. Resmî HGS yükleme kanalını kullanın.'], 403);
            }
            $amount = round((float) ($data['amount'] ?? 0), 2);
            if ($amount < 50 || $amount > 5000) {
                jsonResponse(['success' => false, 'message' => 'Yükleme tutarı 50 ₺ ile 5.000 ₺ arasında olmalıdır.'], 422);
            }
            $reference = randomReference('RP-DEMO');
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE hgs_accounts SET balance=balance+? WHERE id=? AND user_id=?')->execute([$amount, $account['id'], $userId]);
                $pdo->prepare('INSERT INTO hgs_transactions (user_id,hgs_account_id,transaction_type,amount,status,payment_method,reference_code,description,is_demo) VALUES (?, ?, "topup", ?, "completed", "Demo Kart", ?, "RoadPass demo bakiye yükleme", 1)')->execute([$userId, $account['id'], $amount, $reference]);
                $pdo->prepare('INSERT INTO notifications (user_id,type,title,message,is_read) VALUES (?,"topup","Bakiye yükleme tamamlandı",?,0)')->execute([$userId, money($amount) . ' demo bakiyenize eklendi.']);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            jsonResponse(['success' => true, 'message' => 'Demo bakiye yükleme tamamlandı.', 'reference' => $reference, 'new_balance' => (float) $account['balance'] + $amount], 201);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    case 'premium':
        $userId = requireAuth();
        $language = userLanguage($pdo, $userId);
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $plans = $pdo->query('SELECT id,code,name_tr,name_en,billing_period,price,currency FROM premium_plans WHERE is_active=1 ORDER BY FIELD(billing_period,"monthly","yearly")')->fetchAll();
            $paymentStmt = $pdo->prepare('SELECT id,amount,currency,status,reference_code,card_brand,card_last4,description,is_demo,created_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 30');
            $paymentStmt->execute([$userId]);
            jsonResponse([
                'success' => true,
                'plans' => $plans,
                'subscription' => activeSubscription($pdo, $userId),
                'payments' => $paymentStmt->fetchAll(),
                'features' => [
                    ['key'=>'vehicles','standard'=>'2','premium'=>'10'],
                    ['key'=>'history','standard'=>'30_days','premium'=>'full'],
                    ['key'=>'ai','standard'=>'limited','premium'=>'advanced'],
                    ['key'=>'routes','standard'=>'basic','premium'=>'alternatives'],
                    ['key'=>'exports','standard'=>'csv','premium'=>'csv_pdf'],
                    ['key'=>'alerts','standard'=>'basic','premium'=>'advanced'],
                ],
                'notice' => localized('Bu prototipte Premium ödeme akışı gerçeğe yakın şekilde gösterilir; gerçek tahsilat yapılmaz ve kart numarası/CVV saklanmaz.', 'This prototype demonstrates a realistic Premium checkout; no real charge is made and card number/CVV are not stored.', $language),
            ]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = requestData();
            $operation = (string) ($data['operation'] ?? 'subscribe');
            if ($operation === 'cancel') {
                $stmt = $pdo->prepare('UPDATE subscriptions SET auto_renew=0,cancelled_at=NOW() WHERE user_id=? AND status IN ("active","trial") AND ends_at>NOW()');
                $stmt->execute([$userId]);
                jsonResponse(['success' => true, 'message' => localized('Otomatik yenileme kapatıldı. Premium dönem sonuna kadar aktif kalır.', 'Auto-renewal is off. Premium remains active until the end of the period.', $language)]);
            }
            if ($operation === 'reactivate') {
                $stmt = $pdo->prepare('UPDATE subscriptions SET auto_renew=1,cancelled_at=NULL WHERE user_id=? AND status IN ("active","trial") AND ends_at>NOW()');
                $stmt->execute([$userId]);
                jsonResponse(['success' => true, 'message' => localized('Otomatik yenileme tekrar açıldı.', 'Auto-renewal has been turned back on.', $language)]);
            }
            $planId = (int) ($data['plan_id'] ?? 0);
            $planStmt = $pdo->prepare('SELECT id,billing_period,price,currency,name_tr,name_en FROM premium_plans WHERE id=? AND is_active=1');
            $planStmt->execute([$planId]);
            $plan = $planStmt->fetch();
            if (!$plan) jsonResponse(['success' => false, 'message' => localized('Premium planı bulunamadı.', 'Premium plan not found.', $language)], 404);
            $cardholder = trim((string) ($data['cardholder'] ?? ''));
            $cardNumber = preg_replace('/\D+/', '', (string) ($data['card_number'] ?? '')) ?? '';
            $expiry = validateCardExpiry((string) ($data['expiry'] ?? ''));
            $cvv = preg_replace('/\D+/', '', (string) ($data['cvv'] ?? '')) ?? '';
            if (mb_strlen($cardholder) < 3 || !validateLuhn($cardNumber) || !$expiry || !preg_match('/^\d{3,4}$/', $cvv) || empty($data['terms'])) {
                jsonResponse(['success'=>false,'message'=>localized('Demo kart bilgilerini ve abonelik onayını kontrol edin. Test için 4242 4242 4242 4242 kullanabilirsiniz.', 'Check the demo card details and subscription confirmation. You can use 4242 4242 4242 4242 for testing.', $language)],422);
            }
            $brand = detectCardBrand($cardNumber);
            $last4 = substr($cardNumber, -4);
            $paymentReference = randomReference('RP-PRO');
            $token = hash('sha256', $paymentReference . $userId . $last4);
            $endsAt = $plan['billing_period'] === 'yearly' ? date('Y-m-d H:i:s', strtotime('+1 year')) : date('Y-m-d H:i:s', strtotime('+1 month'));
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE payment_methods SET is_default=0 WHERE user_id=?')->execute([$userId]);
                $methodStmt = $pdo->prepare('INSERT INTO payment_methods (user_id,provider,demo_token,card_brand,card_last4,holder_name,expiry_month,expiry_year,is_default) VALUES (?,"roadpass_demo",?,?,?,?,?,?,1)');
                $methodStmt->execute([$userId,$token,$brand,$last4,$cardholder,$expiry['month'],$expiry['year']]);
                $methodId = (int) $pdo->lastInsertId();
                $pdo->prepare('UPDATE subscriptions SET status="cancelled",auto_renew=0,cancelled_at=NOW() WHERE user_id=? AND status IN ("active","trial")')->execute([$userId]);
                $subscriptionStmt = $pdo->prepare('INSERT INTO subscriptions (user_id,plan_id,status,starts_at,ends_at,cancelled_at,auto_renew,payment_method_id,is_demo) VALUES (?, ?, "active", NOW(), ?, NULL, 1, ?, 1)');
                $subscriptionStmt->execute([$userId,$planId,$endsAt,$methodId]);
                $subscriptionId = (int) $pdo->lastInsertId();
                $paymentStmt = $pdo->prepare('INSERT INTO subscription_payments (user_id,subscription_id,plan_id,amount,currency,status,reference_code,card_brand,card_last4,description,is_demo) VALUES (?,?,?,?,?,"completed",?,?,?, ?,1)');
                $paymentStmt->execute([$userId,$subscriptionId,$planId,$plan['price'],$plan['currency'],$paymentReference,$brand,$last4,localized('RoadPass Premium demo abonelik ödemesi','RoadPass Premium demo subscription payment',$language)]);
                $pdo->prepare('INSERT INTO notifications (user_id,type,title,message,is_read) VALUES (? ,"premium",?,?,0)')->execute([$userId, localized('RoadPass Premium aktif','RoadPass Premium active',$language), localized('Premium özellikleriniz kullanıma açıldı.','Your Premium features are now available.',$language)]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            jsonResponse(['success'=>true,'message'=>localized('RoadPass Premium demo aboneliği aktif edildi.','RoadPass Premium demo subscription activated.',$language),'ends_at'=>$endsAt,'reference'=>$paymentReference,'card'=>['brand'=>$brand,'last4'=>$last4]],201);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    case 'notifications':
        $userId = requireAuth();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $pdo->prepare('SELECT id,type,title,message,is_read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50');
            $stmt->execute([$userId]);
            jsonResponse(['success' => true, 'notifications' => $stmt->fetchAll()]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = requestData();
            $id = (int) ($data['id'] ?? 0);
            if ($id > 0) {
                $pdo->prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?')->execute([$id, $userId]);
            } else {
                $pdo->prepare('UPDATE notifications SET is_read=1 WHERE user_id=?')->execute([$userId]);
            }
            jsonResponse(['success' => true, 'message' => 'Bildirimler okundu olarak işaretlendi.']);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    case 'route_estimate':
        requireMethod('POST');
        $userId=requireAuth();$language=userLanguage($pdo,$userId);$data=requestData();
        $from=trim((string)($data['from']??''));$to=trim((string)($data['to']??''));$vehicleId=(int)($data['vehicle_id']??0);$avoidTolls=!empty($data['avoid_tolls']);
        if($from===''||$to===''||mb_strlen($from)>500||mb_strlen($to)>500)jsonResponse(['success'=>false,'message'=>localized('Geçerli başlangıç ve varış adresi girin.','Enter valid origin and destination addresses.',$language)],422);
        $vehicleStmt=$pdo->prepare('SELECT v.id,v.plate,v.brand,v.model,v.manufacture_year,v.body_type,v.fuel_type,v.transmission,v.engine_label,v.average_consumption,v.tank_capacity,v.battery_capacity,v.current_fuel_liters,v.current_charge_percent,vt.code,vt.name_tr,vt.name_en,vt.hgs_class FROM vehicles v LEFT JOIN vehicle_types vt ON vt.id=v.vehicle_type_id WHERE v.id=? AND v.user_id=?');$vehicleStmt->execute([$vehicleId,$userId]);$vehicle=$vehicleStmt->fetch();if(!$vehicle)jsonResponse(['success'=>false,'message'=>localized('Seçilen araç bulunamadı.','Selected vehicle was not found.',$language)],404);
        $balanceStmt=$pdo->prepare('SELECT COALESCE(SUM(balance),0) FROM hgs_accounts WHERE user_id=?');$balanceStmt->execute([$userId]);$balance=(float)$balanceStmt->fetchColumn();
        $fuelType=(string)($vehicle['fuel_type']?:'gasoline');$defaultPrices=['gasoline'=>48.50,'diesel'=>49.50,'lpg'=>26.00,'hybrid'=>48.50,'electric'=>3.50,'other'=>45.00];
        $unitPrice=max(0,min(1000,(float)($data['fuel_price']??$defaultPrices[$fuelType]??45)));$margin=max(0,min(50,(float)($data['safety_margin_percent']??15)));$parking=max(0,min(100000,(float)($data['parking_budget']??0)));
        $currentFuel=($data['current_fuel_liters']??'')===''?($vehicle['current_fuel_liters']!==null?(float)$vehicle['current_fuel_liters']:null):(float)$data['current_fuel_liters'];
        $currentCharge=($data['current_charge_percent']??'')===''?($vehicle['current_charge_percent']!==null?(float)$vehicle['current_charge_percent']:null):(float)$data['current_charge_percent'];
        $defaultConsumption=['motorcycle'=>3.7,'light_commercial'=>8.5,'minibus'=>11.5,'bus'=>25.0,'truck'=>30.0,'car'=>7.0];$consumption=(float)($vehicle['average_consumption']?:($defaultConsumption[$vehicle['code']]??7.0));
        $routes=fallbackRoutes($from,$to,(string)($vehicle['code']?:'car'),$avoidTolls);
        foreach($routes as $index=>&$route){
            $distanceKm=(float)$route['distance_meters']/1000;$baseNeed=round($distanceKm*$consumption/100,2);$safeNeed=round($baseNeed*(1+$margin/100),2);$available=null;$sufficient=null;$missing=null;$arrival=null;$unit=$fuelType==='electric'?'kWh':'L';
            if($fuelType==='electric'){$capacity=(float)($vehicle['battery_capacity']?:0);if($capacity>0&&$currentCharge!==null){$available=round($capacity*max(0,min(100,$currentCharge))/100,2);$sufficient=$available>=$safeNeed;$missing=max(0,round($safeNeed-$available,2));$arrival=max(0,round(($available-$baseNeed)/$capacity*100,1));}}
            else{if($currentFuel!==null){$available=max(0,$currentFuel);$sufficient=$available>=$safeNeed;$missing=max(0,round($safeNeed-$available,2));$arrival=max(0,round($available-$baseNeed,2));}}
            $fuelCost=round($baseNeed*$unitPrice,2);$tollKnown=$route['toll']!==null;$knownToll=$tollKnown?(float)$route['toll']:0.0;
            $route['fuel_cost']=$fuelCost;$route['parking_budget']=$parking;$route['known_total_cost']=round($knownToll+$fuelCost+$parking,2);$route['total_cost']=$route['known_total_cost'];$route['total_complete']=$tollKnown;
            $route['fuel_analysis']=['fuel_type'=>$fuelType,'unit'=>$unit,'average_consumption'=>$consumption,'base_required'=>$baseNeed,'required_with_margin'=>$safeNeed,'available'=>$available,'sufficient'=>$sufficient,'missing'=>$missing,'arrival_level'=>$arrival,'unit_price'=>$unitPrice,'safety_margin_percent'=>$margin,'battery_capacity'=>$vehicle['battery_capacity'],'tank_capacity'=>$vehicle['tank_capacity']];
            $route['breakdown']=prototypeTollBreakdown($from,$to,$route['toll']!==null?(float)$route['toll']:null,(string)($vehicle['code']?:'car'),$index,$language,$route['corridor_key']??null);
            $route['toll_message']=match($route['toll_status']??'unverified'){
                'user_selected_no_toll'=>localized('Ücretli yolları kullanma tercihinize göre HGS bütçesi 0 TL hesaplandı. Yol süresi prototiptir.','The HGS budget is TRY 0 based on your avoid-tolls preference. Travel time is a prototype estimate.',$language),
                'unverified_local'=>localized('Kısa veya aynı il içi rota görünüyor; canlı yol seçimi olmadığı için HGS ücreti doğrulanamadı ve tutar eklenmedi.','This appears to be a short or same-province route; without live routing, the HGS fee could not be verified and no amount was added.',$language),
                'estimated_no_toll_alternative'=>localized('Bu alternatif, ücretli yol kullanılmadan hesaplanan prototip seçenektir.','This alternative is a prototype option calculated without toll roads.',$language),
                'verified_corridor_estimate'=>localized('Ücretli koridor tespit edildi; tutar güncel olmayan prototip tarifedir.','A toll corridor was detected; the amount uses a non-live prototype tariff.',$language),
                default=>localized('Rota için ücretli yol bilgisi doğrulanamadı; HGS tutarı gösterilmedi.','Toll-road data could not be verified for this route; no HGS amount is shown.',$language),
            };
            $route['steps']=[];$route['encoded_polyline']='';
        }unset($route);
        $needsStation=false;foreach($routes as $r){if(($r['fuel_analysis']['sufficient']??null)===false){$needsStation=true;break;}}
        $stations=[];if($needsStation){$stationStmt=$pdo->prepare('SELECT id,name,province,district,address,latitude,longitude,is_24h,source FROM fuel_stations WHERE is_active=1 AND (LOWER(?) LIKE CONCAT("%",LOWER(province),"%") OR LOWER(?) LIKE CONCAT("%",LOWER(province),"%")) ORDER BY province,name LIMIT 6');$stationStmt->execute([$from,$to]);$stations=$stationStmt->fetchAll();}
        $mapsUrl='https://www.google.com/maps/dir/?api=1&origin='.rawurlencode($from).'&destination='.rawurlencode($to).'&travelmode=driving';
        jsonResponse(['success'=>true,'source'=>'roadpass_prototype_v4','routes'=>$routes,'from'=>$from,'to'=>$to,'vehicle_id'=>$vehicleId,'vehicle'=>$vehicle,'balance'=>$balance,'google_maps_url'=>$mapsUrl,'stations'=>$stations,'tariff_version'=>'RoadPass Doğrulanmış Koridor Prototipi v4','disclaimer'=>localized('RoadPass bilinmeyen rotalarda HGS ücreti uydurmaz. 0 TL yalnızca ücretli yollardan kaçınma tercihi seçildiğinde veya doğrulanmış ücretsiz alternatifte gösterilir; tutar yalnızca tanımlı ücretli koridorda gösterilir. Mesafe, süre, yakıt ve tarife verileri yine prototiptir.','RoadPass does not invent HGS charges for unknown routes. TRY 0 is shown only when avoid-tolls is selected or for a verified no-toll alternative; an amount is shown only for a defined toll corridor. Distance, duration, fuel, and tariff data are still prototypes.',$language)]);

    case 'journey_plans':
        $userId=requireAuth();$language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){$stmt=$pdo->prepare('SELECT jp.id,jp.vehicle_id,jp.origin,jp.destination,jp.estimated_toll,jp.toll_status,jp.total_complete,jp.estimated_duration_seconds,jp.estimated_distance_meters,jp.estimated_fuel_cost,jp.estimated_total_cost,jp.fuel_sufficient,jp.origin_detail,jp.destination_detail,jp.created_at,v.plate FROM journey_plans jp LEFT JOIN vehicles v ON v.id=jp.vehicle_id WHERE jp.user_id=? ORDER BY jp.created_at DESC LIMIT 30');$stmt->execute([$userId]);jsonResponse(['success'=>true,'plans'=>$stmt->fetchAll()]);}
        if($_SERVER['REQUEST_METHOD']==='POST'){$data=requestData();$from=trim((string)($data['from']??''));$to=trim((string)($data['to']??''));$vehicleId=(int)($data['vehicle_id']??0);$route=is_array($data['route']??null)?$data['route']:[];if($from===''||$to===''||$vehicleId<=0)jsonResponse(['success'=>false,'message'=>localized('Yolculuk bilgileri eksik.','Journey details are incomplete.',$language)],422);$v=$pdo->prepare('SELECT id FROM vehicles WHERE id=? AND user_id=?');$v->execute([$vehicleId,$userId]);if(!$v->fetch())jsonResponse(['success'=>false,'message'=>localized('Araç bulunamadı.','Vehicle not found.',$language)],404);$limit=activeSubscription($pdo,$userId)?20:3;$count=$pdo->prepare('SELECT COUNT(*) FROM journey_plans WHERE user_id=?');$count->execute([$userId]);if((int)$count->fetchColumn()>=$limit)jsonResponse(['success'=>false,'message'=>localized("Kayıtlı yolculuk limitine ulaştınız ({$limit}).","You have reached the saved journey limit ({$limit}).",$language)],403);$fuel=is_array($route['fuel_analysis']??null)?$route['fuel_analysis']:[];$tollValue=array_key_exists('toll',$route)&&$route['toll']!==null?round((float)$route['toll'],2):null;$tollStatus=substr((string)($route['toll_status']??'unverified'),0,40);$totalComplete=!empty($route['total_complete'])?1:0;$stmt=$pdo->prepare('INSERT INTO journey_plans (user_id,vehicle_id,origin,destination,estimated_toll,toll_status,total_complete,estimated_duration_seconds,estimated_distance_meters,estimated_fuel_cost,estimated_total_cost,fuel_sufficient,origin_detail,destination_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');$stmt->execute([$userId,$vehicleId,$from,$to,$tollValue,$tollStatus,$totalComplete,(int)($route['duration_seconds']??0),(int)($route['distance_meters']??0),round((float)($route['fuel_cost']??0),2),round((float)($route['known_total_cost']??$route['total_cost']??0),2),array_key_exists('sufficient',$fuel)&&$fuel['sufficient']!==null?($fuel['sufficient']?1:0):null,$from,$to]);jsonResponse(['success'=>true,'message'=>localized('Yolculuk kaydedildi.','Journey saved.',$language),'id'=>(int)$pdo->lastInsertId()],201);}
        if($_SERVER['REQUEST_METHOD']==='DELETE'){$id=(int)($_GET['id']??0);$pdo->prepare('DELETE FROM journey_plans WHERE id=? AND user_id=?')->execute([$id,$userId]);jsonResponse(['success'=>true,'message'=>localized('Kayıtlı yolculuk silindi.','Saved journey deleted.',$language)]);}
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'ai_history':
        $userId = requireAuth();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $pdo->prepare('SELECT id,role,content,mode,created_at FROM (SELECT id,role,content,mode,created_at FROM ai_messages WHERE user_id=? ORDER BY created_at DESC LIMIT 60) x ORDER BY created_at ASC');
            $stmt->execute([$userId]);
            jsonResponse(['success' => true, 'messages' => $stmt->fetchAll()]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $pdo->prepare('DELETE FROM ai_messages WHERE user_id=?')->execute([$userId]);
            $pdo->prepare('INSERT INTO ai_messages (user_id,role,content,mode) VALUES (?,"assistant","Yeni sohbet başladı. Size nasıl yardımcı olabilirim?","system-welcome")')->execute([$userId]);
            jsonResponse(['success' => true, 'message' => 'AI sohbet geçmişi temizlendi.']);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    case 'ai_assistant':
        requireMethod('POST');
        $userId = requireAuth();
        $language = userLanguage($pdo, $userId);
        $data = requestData();
        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 1200) {
            jsonResponse(['success' => false, 'message' => localized('1–1200 karakter arasında bir soru yazmalısınız.', 'Your question must be between 1 and 1200 characters.', $language)], 422);
        }
        $rateStmt = $pdo->prepare('SELECT COUNT(*) FROM ai_messages WHERE user_id=? AND role="user" AND created_at>=DATE_SUB(NOW(),INTERVAL 1 MINUTE)');
        $rateStmt->execute([$userId]);
        if ((int) $rateStmt->fetchColumn() >= 10) {
            jsonResponse(['success' => false, 'message' => localized('Çok hızlı mesaj gönderiyorsunuz. Biraz sonra tekrar deneyin.', 'You are sending messages too quickly. Please try again shortly.', $language)], 429);
        }

        $balanceStmt = $pdo->prepare('SELECT COALESCE(SUM(balance),0) FROM hgs_accounts WHERE user_id=?');
        $balanceStmt->execute([$userId]);
        $balance = (float) $balanceStmt->fetchColumn();
        $monthStmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) AS total,COUNT(*) AS count FROM passages WHERE user_id=? AND deleted_at IS NULL AND passed_at>=DATE_FORMAT(CURRENT_DATE,"%Y-%m-01")');
        $monthStmt->execute([$userId]);
        $month = $monthStmt->fetch() ?: ['total'=>0,'count'=>0];
        $vehicleStmt = $pdo->prepare('SELECT plate,brand,model,is_default FROM vehicles WHERE user_id=? ORDER BY is_default DESC LIMIT 10');
        $vehicleStmt->execute([$userId]);
        $vehicles = $vehicleStmt->fetchAll();
        $historyStmt = $pdo->prepare('SELECT role,content FROM ai_messages WHERE user_id=? ORDER BY created_at DESC LIMIT 10');
        $historyStmt->execute([$userId]);
        $history = array_reverse($historyStmt->fetchAll());
        $context = [
            'balance_try' => $balance,
            'month_spend_try' => (float) $month['total'],
            'month_passage_count' => (int) $month['count'],
            'vehicles' => $vehicles,
            'premium' => activeSubscription($pdo, $userId) !== null,
        ];

        $pdo->prepare('INSERT INTO ai_messages (user_id,role,content,mode) VALUES (?,"user",?,"user")')->execute([$userId, $message]);
        $mode = 'rule-based';
        $integrationError = null;
        if (trim((string) env('OPENAI_API_KEY', '')) !== '') {
            try {
                $reply = callOpenAiAssistant($message, $context, $history, $language);
                $mode = boolEnv('OPENAI_WEB_SEARCH', false) ? 'openai-web' : 'openai';
            } catch (Throwable $e) {
                $integrationError = $e->getMessage();
            }
        }

        if (!isset($reply)) {
            $lower = mb_strtolower($message, 'UTF-8');
            $monthSpend = (float) $month['total'];
            $monthCount = (int) $month['count'];
            if (str_contains($lower, 'bakiye') || str_contains($lower, 'yeter') || str_contains($lower, 'balance')) {
                $daily = $monthSpend / max((int) date('j'), 1);
                $days = $daily > 0 ? floor($balance / $daily) : null;
                $reply = $language === 'en'
                    ? ($days === null ? 'There is not enough spending data for a precise estimate. Your current demo balance is ' . money($balance) . '.' : 'Your current balance is ' . money($balance) . '. At this month’s usage rate, it may last about ' . max(0, (int) $days) . ' days.')
                    : ($days === null ? 'Net tahmin için henüz yeterli harcama verisi yok. Mevcut demo bakiyeniz ' . money($balance) . '.' : 'Mevcut bakiyeniz ' . money($balance) . '. Bu ayki kullanım hızınıza göre yaklaşık ' . max(0, (int) $days) . ' gün yetebilir.');
            } elseif (str_contains($lower, 'tasarruf') || str_contains($lower, 'ekonomik') || str_contains($lower, 'save')) {
                $reply = localized('Bu ay ' . money($monthSpend) . ' harcama yaptınız. Alternatif rotaları karşılaştırın, yoğun saatlerden kaçının ve düşük bakiye uyarısını aktif tutun.', 'You spent ' . money($monthSpend) . ' this month. Compare alternative routes, avoid peak hours, and keep low-balance alerts enabled.', $language);
            } elseif (str_contains($lower, 'ceza') || str_contains($lower, 'ihlal') || str_contains($lower, 'risk') || str_contains($lower, 'fine')) {
                $reply = localized($balance < 250 ? 'Bakiyeniz düşük. Geçiş ihlali riskini azaltmak için resmî HGS hesabınızı kontrol edip yükleme yapın.' : 'Demo bakiyeniz normal görünüyor. Bekleyen veya ihlalli geçişleri yine de resmî HGS kanallarından kontrol edin.', $balance < 250 ? 'Your balance is low. Check and top up your official HGS account to reduce violation risk.' : 'Your demo balance looks normal. Still check pending or violated passages through official HGS channels.', $language);
            } elseif (str_contains($lower, 'harcama') || str_contains($lower, 'rapor') || str_contains($lower, 'spend')) {
                $avg = $monthCount > 0 ? $monthSpend / $monthCount : 0;
                $reply = localized('Bu ay ' . $monthCount . ' geçişte toplam ' . money($monthSpend) . ' harcama görünüyor. Ortalama geçiş maliyeti ' . money($avg) . '.', 'This month shows ' . $monthCount . ' passages totaling ' . money($monthSpend) . '. The average passage cost is ' . money($avg) . '.', $language);
            } elseif (str_contains($lower, 'polis') || str_contains($lower, 'radar')) {
                $reply = localized('Polis veya radar konumu paylaşamam. Güvenli sürüş için yasal hız sınırına uyun, trafik işaretlerini takip edin ve resmî yol duyurularını kontrol edin.', 'I cannot provide police or radar locations. Follow legal speed limits, road signs, and official road notices for safe driving.', $language);
            } elseif (str_contains($lower, 'merhaba') || str_contains($lower, 'selam') || str_contains($lower, 'hello') || str_contains($lower, 'hi')) {
                $reply = localized('Merhaba! RoadPass hesabınız, araçlarınız, rota planlama veya günlük bir soru hakkında yardımcı olabilirim.', 'Hello! I can help with your RoadPass account, vehicles, route planning, or a general everyday question.', $language);
            } else {
                $reply = localized('RoadPass akıllı rehber modundayım. Bakiye, harcama, araç yönetimi, geçiş geçmişi, Premium ve yolculuk maliyeti konularında yardımcı olabilirim.', 'I am running in RoadPass smart guide mode. I can help with balance, spending, vehicle management, passage history, Premium, and journey costs.', $language);
            }
        }

        $pdo->prepare('INSERT INTO ai_messages (user_id,role,content,mode) VALUES (?,"assistant",?,?)')->execute([$userId, $reply, $mode]);
        jsonResponse([
            'success' => true,
            'reply' => $reply,
            'mode' => $mode,
            'integration_error' => filter_var(env('APP_DEBUG', false), FILTER_VALIDATE_BOOL) ? $integrationError : null,
            'disclaimer' => localized('AI yanıtları resmî HGS, hukuki veya finansal danışmanlık değildir.', 'AI responses are not official HGS, legal, or financial advice.', $language),
        ]);

    case 'support':
        $userId=requireAuth();
        $language=userLanguage($pdo,$userId);
        if($_SERVER['REQUEST_METHOD']==='GET'){
            $stmt=$pdo->prepare('SELECT id,reference_code,category,subject,message,status,priority,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 20');$stmt->execute([$userId]);
            $faqs=$language==='en' ? [
                ['question'=>'How do I add a vehicle?','answer'=>'Open My Vehicles, choose the vehicle type, then select a compatible brand and model. Plate format is validated automatically.'],
                ['question'=>'Does a demo top-up affect my real HGS account?','answer'=>'No. Demo top-ups change only the prototype balance. Use the official HGS channel for real payments.'],
                ['question'=>'How is the journey cost calculated?','answer'=>'RoadPass uses a prototype tariff and your vehicle class to create an estimate. It is not an official toll quote.'],
                ['question'=>'What happens when I delete passage history?','answer'=>'Records move to Trash and can be restored. They are not permanently removed in this prototype.'],
                ['question'=>'Are card details stored during Premium checkout?','answer'=>'No full card number or CVV is stored. The demo history keeps only the card brand and last four digits.'],
            ] : [
                ['question'=>'Araç nasıl eklenir?','answer'=>'Araçlarım ekranından araç tipini seçin; ardından uyumlu marka ve modeli belirleyin. Plaka biçimi otomatik doğrulanır.'],
                ['question'=>'Demo bakiye yükleme gerçek HGS hesabımı etkiler mi?','answer'=>'Hayır. Demo yükleme yalnızca prototip bakiyesini değiştirir. Gerçek ödeme için resmî HGS kanalını kullanın.'],
                ['question'=>'Yolculuk maliyeti nasıl hesaplanıyor?','answer'=>'RoadPass prototip tarifesi ve aracınızın sınıfıyla tahmin üretir. Bu tutar resmî geçiş ücreti değildir.'],
                ['question'=>'Geçiş geçmişini silince ne olur?','answer'=>'Kayıtlar çöp kutusuna taşınır ve geri yüklenebilir. Prototipte kalıcı olarak yok edilmez.'],
                ['question'=>'Premium ödemede kart bilgilerim saklanıyor mu?','answer'=>'Tam kart numarası ve CVV saklanmaz. Demo geçmişte yalnızca kart markası ve son dört hane tutulur.'],
            ];
            jsonResponse(['success'=>true,'faqs'=>$faqs,'tickets'=>$stmt->fetchAll()]);
        }
        if($_SERVER['REQUEST_METHOD']==='POST'){
            $data=requestData();$category=(string)($data['category']??'other');$subject=trim((string)($data['subject']??''));$message=trim((string)($data['message']??''));
            if(!in_array($category,['account','wallet','vehicle','premium','other'],true))$category='other';
            if(mb_strlen($subject)<4||mb_strlen($subject)>140||mb_strlen($message)<10||mb_strlen($message)>2000)jsonResponse(['success'=>false,'message'=>localized('Konu en az 4, mesaj en az 10 karakter olmalıdır.','Subject must be at least 4 characters and message at least 10 characters.',$language)],422);
            $reference=randomReference('RP-SUP');$stmt=$pdo->prepare('INSERT INTO support_tickets (user_id,reference_code,category,subject,message,status,priority) VALUES (?,?,?,?,?,"open","normal")');$stmt->execute([$userId,$reference,$category,$subject,$message]);
            jsonResponse(['success'=>true,'message'=>localized('Destek talebi oluşturuldu.','Support request created.',$language),'reference'=>$reference],201);
        }
        jsonResponse(['success'=>false,'message'=>'Desteklenmeyen işlem.'],405);

    case 'profile':
        $userId = requireAuth();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $stmt = $pdo->prepare('SELECT u.id,u.role,u.full_name,u.phone,u.email,u.profile_photo,s.theme,s.language,s.push_enabled,s.email_enabled,s.premium_theme_enabled,COALESCE(s.simple_mode,0) simple_mode,COALESCE(s.large_text,0) large_text,COALESCE(s.accent_theme,"aurora") accent_theme FROM users u LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id=?');
            $stmt->execute([$userId]);
            $profile = $stmt->fetch();
            $profile['membership'] = activeSubscription($pdo, $userId) ? 'premium' : 'standard';
            jsonResponse(['success' => true, 'profile' => $profile]);
        }
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = requestData();
            $name = trim((string) ($data['full_name'] ?? ''));
            $phone = trim((string) ($data['phone'] ?? ''));
            $language = in_array(($data['language'] ?? 'tr'), ['tr','en'], true) ? (string) $data['language'] : 'tr';
            $push = !empty($data['push_enabled']) ? 1 : 0;
            $emailEnabled = !empty($data['email_enabled']) ? 1 : 0;
            $premiumTheme = !empty($data['premium_theme_enabled']) ? 1 : 0;
            $simpleMode = !empty($data['simple_mode']) ? 1 : 0;
            $largeText = !empty($data['large_text']) ? 1 : 0;
            $accentTheme = in_array(($data['accent_theme'] ?? 'aurora'), ['aurora','mint','midnight'], true) ? (string)$data['accent_theme'] : 'aurora';
            if (mb_strlen($name) < 3) {
                jsonResponse(['success' => false, 'message' => 'Ad soyad alanı geçersiz.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE users SET full_name=?,phone=? WHERE id=?')->execute([$name, $phone, $userId]);
                $pdo->prepare('UPDATE user_settings SET language=?,push_enabled=?,email_enabled=?,premium_theme_enabled=?,simple_mode=?,large_text=?,accent_theme=? WHERE user_id=?')->execute([$language, $push, $emailEnabled, $premiumTheme, $simpleMode, $largeText, $accentTheme, $userId]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            jsonResponse(['success' => true, 'message' => 'Profil güncellendi.', 'language' => $language]);
        }
        jsonResponse(['success' => false, 'message' => 'Desteklenmeyen işlem.'], 405);

    default:
        jsonResponse(['success' => false, 'message' => 'API işlemi bulunamadı.'], 404);
}
