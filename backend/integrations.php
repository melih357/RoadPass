<?php
declare(strict_types=1);

function roadpassNormalizeLocation(string $value): string
{
    $map = ['İ'=>'i','I'=>'i','ı'=>'i','Ş'=>'s','ş'=>'s','Ğ'=>'g','ğ'=>'g','Ü'=>'u','ü'=>'u','Ö'=>'o','ö'=>'o','Ç'=>'c','ç'=>'c'];
    return preg_replace('/[^a-z0-9]+/', ' ', strtr(mb_strtolower($value, 'UTF-8'), $map)) ?? '';
}

function roadpassExtractProvince(string $value): ?string
{
    $normalized = ' ' . roadpassNormalizeLocation($value) . ' ';
    $provinces = [
        'adana','adiyaman','afyonkarahisar','agri','amasya','ankara','antalya','artvin','aydin','balikesir','bilecik','bingol','bitlis','bolu','burdur','bursa','canakkale','cankiri','corum','denizli','diyarbakir','edirne','elazig','erzincan','erzurum','eskisehir','gaziantep','giresun','gumushane','hakkari','hatay','isparta','mersin','istanbul','izmir','kars','kastamonu','kayseri','kirklareli','kirsehir','kocaeli','konya','kutahya','malatya','manisa','kahramanmaras','mardin','mugla','mus','nevsehir','nigde','ordu','rize','sakarya','samsun','siirt','sinop','sivas','tekirdag','tokat','trabzon','tunceli','sanliurfa','usak','van','yozgat','zonguldak','aksaray','bayburt','karaman','kirikkale','batman','sirnak','bartin','ardahan','igdir','yalova','karabuk','kilis','osmaniye','duzce'
    ];
    foreach ($provinces as $province) {
        if (str_contains($normalized, ' ' . $province . ' ')) return $province;
    }
    return null;
}

function fallbackRoutes(string $from, string $to, string $vehicleCode = 'car', bool $avoidTolls = false): array
{
    $fromProvince = roadpassExtractProvince($from);
    $toProvince = roadpassExtractProvince($to);
    $normalizedPair = ($fromProvince ?? '') . '-' . ($toProvince ?? '');
    $seed = abs(crc32(roadpassNormalizeLocation($from) . '|' . roadpassNormalizeLocation($to)));

    $known = [
        'istanbul-ankara' => [449000, 17100, 345.00, 'anatolian_motorway'],
        'ankara-istanbul' => [449000, 17100, 345.00, 'anatolian_motorway'],
        'istanbul-izmir' => [480000, 18000, 1240.00, 'osmangazi_o5'],
        'izmir-istanbul' => [480000, 18000, 1240.00, 'osmangazi_o5'],
        'istanbul-bursa' => [154000, 6900, 795.00, 'osmangazi_o5'],
        'bursa-istanbul' => [154000, 6900, 795.00, 'osmangazi_o5'],
        'ankara-izmir' => [589000, 23400, 175.00, 'known_toll_corridor'],
        'izmir-ankara' => [589000, 23400, 175.00, 'known_toll_corridor'],
    ];

    $multiplier = match ($vehicleCode) {
        'motorcycle' => 0.6,
        'light_commercial', 'minibus' => 1.45,
        'bus', 'truck' => 2.4,
        default => 1.0,
    };

    // Kullanıcı ücretli yollardan kaçınmayı seçtiyse HGS bütçesi 0 TL kabul edilir.
    // Mesafe ve süre yine prototiptir; canlı bir no-toll navigasyon rotası değildir.
    if ($avoidTolls) {
        if (isset($known[$normalizedPair])) {
            [$knownDistance, $knownDuration] = $known[$normalizedPair];
            $distance = $knownDistance + 70000;
            $duration = $knownDuration + 4200;
        } elseif ($fromProvince !== null && $fromProvince === $toProvince) {
            $distance = (6 + ($seed % 33)) * 1000;
            $duration = (12 + ($seed % 59)) * 60;
        } else {
            $distance = (55 + ($seed % 560)) * 1000;
            $duration = (65 + ($seed % 390)) * 60;
        }
        return [[
            'label'=>'recommended','distance_meters'=>$distance,'duration_seconds'=>$duration,
            'static_duration_seconds'=>$duration,'toll'=>0.0,'currency'=>'TRY','has_tolls'=>false,
            'toll_status'=>'user_selected_no_toll','toll_confidence'=>'user_preference','corridor_key'=>null,
            'encoded_polyline'=>'','steps'=>[],
        ]];
    }

    // Aynı il içinde hangi yolun kullanılacağı canlı rota olmadan doğrulanamaz.
    // Bu yüzden ücret eklenmez ancak yanlış biçimde “kesin 0 TL” de denmez.
    if ($fromProvince !== null && $fromProvince === $toProvince) {
        $distance = (6 + ($seed % 33)) * 1000;
        $duration = (12 + ($seed % 59)) * 60;
        return [[
            'label'=>'recommended','distance_meters'=>$distance,'duration_seconds'=>$duration,
            'static_duration_seconds'=>$duration,'toll'=>null,'currency'=>'TRY','has_tolls'=>null,
            'toll_status'=>'unverified_local','toll_confidence'=>'none','corridor_key'=>null,
            'encoded_polyline'=>'','steps'=>[],
        ]];
    }

    if (isset($known[$normalizedPair])) {
        [$distance, $duration, $baseToll, $corridor] = $known[$normalizedPair];
        $toll = round($baseToll * $multiplier, 2);
        return [
            [
                'label'=>'recommended','distance_meters'=>$distance,'duration_seconds'=>$duration,
                'static_duration_seconds'=>$duration,'toll'=>$toll,'currency'=>'TRY','has_tolls'=>true,
                'toll_status'=>'verified_corridor_estimate','toll_confidence'=>'known_corridor','corridor_key'=>$corridor,
                'encoded_polyline'=>'','steps'=>[],
            ],
            [
                'label'=>'alternative','distance_meters'=>$distance + 70000,'duration_seconds'=>$duration + 4200,
                'static_duration_seconds'=>$duration + 4200,'toll'=>0.0,'currency'=>'TRY','has_tolls'=>false,
                'toll_status'=>'estimated_no_toll_alternative','toll_confidence'=>'prototype_alternative','corridor_key'=>null,
                'encoded_polyline'=>'','steps'=>[],
            ],
        ];
    }

    // Bilinmeyen rotalarda sadece mesafe/süre prototipi verilir; HGS ücreti tahmin edilmez.
    $distance = (45 + ($seed % 520)) * 1000;
    $duration = (50 + ($seed % 360)) * 60;
    return [[
        'label'=>'recommended','distance_meters'=>$distance,'duration_seconds'=>$duration,
        'static_duration_seconds'=>$duration,'toll'=>null,'currency'=>'TRY','has_tolls'=>null,
        'toll_status'=>'unverified','toll_confidence'=>'none','corridor_key'=>null,
        'encoded_polyline'=>'','steps'=>[],
    ]];
}

function extractOpenAiText(array $response): string
{
    if (isset($response['output_text']) && is_string($response['output_text'])) {
        return trim($response['output_text']);
    }
    $parts = [];
    foreach (($response['output'] ?? []) as $item) {
        foreach (($item['content'] ?? []) as $content) {
            if (($content['type'] ?? '') === 'output_text' && isset($content['text'])) {
                $parts[] = (string) $content['text'];
            }
        }
    }
    return trim(implode("\n", $parts));
}

function callOpenAiAssistant(string $message, array $context, array $history, string $language): string
{
    $key = trim((string) env('OPENAI_API_KEY', ''));
    if ($key === '') {
        throw new RuntimeException('OpenAI API anahtarı yapılandırılmamış.');
    }

    $historyText = '';
    foreach (array_slice($history, -8) as $item) {
        $role = ($item['role'] ?? '') === 'assistant' ? 'Asistan' : 'Kullanıcı';
        $historyText .= $role . ': ' . trim((string) ($item['content'] ?? '')) . "\n";
    }

    $instructions = 'Sen RoadPass web uygulamasının yardımcı asistanısın. Kullanıcının RoadPass hesabıyla ilgili sorularını verilen hesap özetiyle yanıtla. Genel günlük sorulara da yardımcı olabilirsin. Güncel bilgi gerektiren konularda web araması etkin değilse kesinlik iddia etme. Polis, radar veya kolluk kuvvetlerinin konumunu takip etmeye ya da bunlardan kaçınmaya yardımcı olma; bunun yerine hız sınırı, trafik güvenliği ve resmî yol uyarıları konusunda güvenli öneri ver. HGS bakiyesi ve ücretler için resmî kaynak kontrolü gerektiğini belirt. Kısa, anlaşılır ve eyleme dönük cevap ver. Yanıt dili: ' . ($language === 'en' ? 'English' : 'Türkçe') . '.';

    $input = "RoadPass hesap özeti:\n" . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n\nSon konuşmalar:\n" . $historyText . "\nYeni soru:\n" . $message;
    $payload = [
        'model' => (string) env('OPENAI_MODEL', 'gpt-5-mini'),
        'instructions' => $instructions,
        'input' => $input,
        'max_output_tokens' => 600,
    ];
    if (boolEnv('OPENAI_WEB_SEARCH', false)) {
        $payload['tools'] = [['type' => 'web_search']];
    }

    $response = postJsonRequest(
        'https://api.openai.com/v1/responses',
        $payload,
        ['Authorization' => 'Bearer ' . $key],
        45
    );
    $text = extractOpenAiText($response);
    if ($text === '') {
        throw new RuntimeException('AI servisi boş yanıt döndürdü.');
    }
    return $text;
}

function prototypeTollBreakdown(string $from, string $to, ?float $total, string $vehicleCode, int $routeIndex, string $language, ?string $corridorKey = null): array
{
    if ($total === null || $total <= 0 || $corridorKey === null) return [];
    $currency = 'TRY';
    $items = match ($corridorKey) {
        'osmangazi_o5' => [
            ['name'=>localized('Osmangazi Köprüsü','Osmangazi Bridge',$language),'detail'=>localized('Doğrulanmış ücretli koridor için prototip tarife','Prototype tariff for a verified toll corridor',$language),'ratio'=>0.62],
            ['name'=>localized('O-5 ücretli otoyol kesimleri','O-5 tolled motorway sections',$language),'detail'=>localized('Araç sınıfına göre tahmin','Estimate by vehicle class',$language),'ratio'=>0.38],
        ],
        'anatolian_motorway' => [
            ['name'=>localized('Anadolu Otoyolu ücretli kesimleri','Anatolian Motorway tolled sections',$language),'detail'=>localized('Doğrulanmış koridor, güncel olmayan prototip tarife','Verified corridor, non-live prototype tariff',$language),'ratio'=>0.82],
            ['name'=>localized('Bağlantı gişeleri','Connection toll gates',$language),'detail'=>localized('Araç sınıfına göre tahmin','Estimate by vehicle class',$language),'ratio'=>0.18],
        ],
        default => [[
            'name'=>localized('Doğrulanmış ücretli yol kesimi','Verified tolled road section',$language),
            'detail'=>localized('RoadPass prototip tarife tahmini','RoadPass prototype tariff estimate',$language),'ratio'=>1.0,
        ]],
    };
    $result=[];$allocated=0.0;
    foreach($items as $index=>$item){
        $amount=$index===count($items)-1?round($total-$allocated,2):round($total*(float)$item['ratio'],2);
        $allocated+=$amount;
        $result[]=['name'=>$item['name'],'detail'=>$item['detail'],'amount'=>$amount,'currency'=>$currency];
    }
    return $result;
}

