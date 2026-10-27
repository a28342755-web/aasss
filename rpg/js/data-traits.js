/*
 * 삼천의 운명 — 직업마다 다른 전투 방식
 *
 * 1. 무기별 기본 공격(WEAPON_STYLES): 같은 '싸운다 → 기본 공격'이라도 쥔 무기에 따라
 *    위력·타수·방어 무시·출혈·기절·흡수 등이 다르다. 무기는 직업 그림(heroes.js)이 정한다.
 * 2. 고유 특성(TRAITS): 기본 직업마다 하나씩 붙는 포켓몬 '특성' 같은 능력.
 *    직업 이름의 낱말(TRAIT_RULES)로 고르고, 맞는 낱말이 없으면 대표 기술의 유형(TRAIT_BY_TYPE)으로 고른다.
 *    수치(v·c)는 등급이 높을수록 커진다(일반 ×1.0 … 신화 ×1.5).
 */
(function (root) {
  "use strict";
  const D = root.FATES.data;

  /* 기본 공격: mult 위력, hits 타수, pen 방어 무시, crit 치명타 확률 추가, mp 회복(기본 4%),
     stun 기절 확률, bleed 출혈(매 턴 위력), drain 흡수 비율, heal HP 회복, debuff 약화 확률,
     curse 저주 확률, extra 하나 더 던질 확률(위력 50%) */
  const WEAPON_STYLES = {
    sword: { mult: 1.05, crit: 0.05 },
    spear: { mult: 1, pen: 0.3 },
    heavy: { mult: 1.15, stun: 0.08 },
    twin: { mult: 0.57, hits: 2 },
    fist: { mult: 0.4, hits: 3 },
    whip: { mult: 0.85, bleed: 0.12 },
    scythe: { mult: 1, drain: 0.12 },
    dagger: { mult: 0.95, crit: 0.25 },
    bow: { mult: 1, crit: 0.12 },
    crossbow: { mult: 1, pen: 0.25, crit: 0.05 },
    gun: { mult: 1.1 },
    cannon: { mult: 1.3, mp: 0.03 },
    staff: { mult: 0.95, mp: 0.08 },
    book: { mult: 0.9, debuff: 0.25, mp: 0.06 },
    orb: { mult: 0.95, pen: 0.4, mp: 0.06 },
    talisman: { mult: 0.9, curse: 0.25, mp: 0.06 },
    music: { mult: 0.85, heal: 0.03 },
    summon: { mult: 0.5, hits: 2, mp: 0.06 },
    throw: { mult: 0.9, extra: 0.3 }
  };

  /* 기본 공격 이름: 계열의 공격 이름이 쥔 무기와 맞으면 그대로 쓰고(전사·검 → 베기),
     맞지 않으면 무기 이름으로 바꾼다(목동·채찍 → 채찍질). 던지기는 던지는 물건으로 */
  const ATTACK_FITS = {
    warrior: "sword,heavy,twin", knight: "sword,spear", archer: "bow,crossbow,gun", gunner: "cannon,gun", rogue: "dagger", assassin: "dagger",
    elemental: "staff,orb", arcane: "book,staff,talisman", dark: "staff,summon,talisman", holy: "staff,book,talisman", nature: "staff,summon",
    spirit: "talisman,staff", martial: "fist", bard: "music", tech: "heavy", alchemy: "throw", oriental: "sword", sea: "sword", military: "spear",
    cosmic: "orb", trickster: "throw,fist,summon", bloodline: "fist,dagger", gathering: "heavy", craft: "heavy", culinary: "heavy",
    scholar: "book", civic: "heavy", service: "whip", building: "heavy", mystic: "staff"
  };
  const WEAPON_ATTACK = {
    sword: "베기", spear: "찌르기", heavy: "내려치기", twin: "쌍검 베기", fist: "주먹질", whip: "채찍질", scythe: "낫 휘두르기",
    dagger: "단검 찌르기", bow: "활쏘기", crossbow: "석궁 쏘기", gun: "사격", cannon: "포격", staff: "마력탄", book: "주문 낭독",
    orb: "수정구 광선", talisman: "부적 날리기", music: "음파탄", summon: "소환수 공격", throw: "던지기"
  };
  const THROW_ATTACK = { flask: "약병 던지기", ball: "공 던지기", card: "카드 던지기", coin: "동전 던지기", paint: "물감 뿌리기", orb: "약병 던지기" };

  /* 고유 특성: v 효과 크기, c 발동 확률. 설명의 {v}·{c}·{v2}는 백분율, {ally}는 함께 싸우는 동료 */
  const TRAITS = {
    frenzy: { name: "광분", v: 0.5, desc: "HP를 잃을수록 주는 피해가 커진다 (HP가 바닥나면 +{v}%)" },
    executioner: { name: "처형", v: 0.7, desc: "HP가 35% 이하인 적에게 주는 피해 +{v}%" },
    giant: { name: "거인 사냥", v: 0.14, v2: 2, desc: "자기보다 HP가 많은 적에게 주는 피해 +{v}%, 보스·강적에게는 +{v2}%" },
    ambush: { name: "기습", v: 0.5, desc: "전투의 첫 공격은 반드시 급소에 맞고 위력 +{v}%" },
    charge: { name: "돌격", v: 0.5, c: 0.35, desc: "첫 턴 공격 위력 +{v}%, {c}% 확률로 적이 움찔해 한 차례 쉰다 (보스는 절반)" },
    momentum: { name: "기세", v: 0.1, desc: "공격할 때마다 위력이 {v}%씩 쌓인다 (최대 5번, 공격하지 않으면 사라진다)" },
    combo: { name: "연격", c: 0.45, desc: "기본 공격이 {c}% 확률로 한 번 더 나간다 (위력 70%)" },
    deadeye: { name: "급소 노리기", v: 0.1, desc: "치명타 확률 +{v}%p, 급소에 맞으면 피해 2.1배 (보통 1.75배)" },
    armorBreak: { name: "갑옷 부수기", v: 0.12, desc: "공격할 때마다 적의 방어를 {v}%씩 깎는다 (최대 50%)" },
    pierce: { name: "관통", v: 0.35, desc: "적의 방어를 {v}% 무시한다" },
    bleedEdge: { name: "피의 칼날", v: 0.15, desc: "공격하면 적에게 3턴 출혈을 남긴다 (매 턴 위력 {v}%)" },
    venom: { name: "맹독", v: 0.22, c: 0.5, desc: "공격하면 {c}% 확률로 적을 4턴 중독시킨다 (매 턴 위력 {v}%)" },
    scorch: { name: "불씨", v: 0.26, c: 0.45, desc: "공격하면 {c}% 확률로 적에게 3턴 화상을 입힌다 (매 턴 위력 {v}%)" },
    chill: { name: "냉기", c: 0.18, desc: "공격하면 {c}% 확률로 적을 얼려 한 차례 쉬게 한다 (보스는 절반)" },
    stagger: { name: "충격", c: 0.18, desc: "공격하면 {c}% 확률로 적을 기절시켜 한 차례 쉬게 한다 (보스는 절반)" },
    shock: { name: "감전", v: 0.6, c: 0.35, desc: "공격하면 {c}% 확률로 번개가 한 번 더 내리친다 (번개 위력 {v}%)" },
    hex: { name: "저주", v: 0.12, c: 0.4, desc: "공격하면 {c}% 확률로 적에게 3턴 저주 (받는 피해 +25%, 매 턴 위력 {v}%)" },
    charmer: { name: "매혹", c: 0.12, desc: "공격하면 {c}% 확률로 적을 2턴 혼란에 빠뜨린다 (보스는 절반)" },
    leech: { name: "흡혈", v: 0.03, desc: "준 피해의 {v}%만큼 HP를 회복한다" },
    spellPower: { name: "마력 증폭", v: 0.22, desc: "기술로 주는 피해 +{v}%" },
    manaFlow: { name: "마나 순환", v: 1, desc: "기본 공격과 방어로 회복하는 MP가 두 배가 된다" },
    inspire: { name: "영감", c: 0.3, desc: "기술을 쓸 때 {c}% 확률로 영감이 떠올라 MP가 들지 않는다" },
    gamble: { name: "도박", c: 0.16, desc: "공격 피해가 70~130%로 들쭉날쭉하고 {c}% 확률로 대박이 터진다 (2.5배)" },
    insight: { name: "간파", v: 0.1, v2: 3, desc: "적의 약점을 꿰뚫어 본다: 주는 피해 +{v}%, 약점을 찌르면 +{v2}%" },
    plunder: { name: "약탈", c: 0.2, desc: "공격하면 {c}% 확률로 골드를 훔친다" },
    fortune: { name: "행운", v: 0.12, desc: "전투로 얻는 골드 +{v}%, 물약을 더 자주 줍는다" },
    bulwark: { name: "철벽", v: 0.15, desc: "받는 피해 -8%, 방어하면 최대 HP {v}%의 보호막을 두른다" },
    ironSkin: { name: "강철 피부", v: 0.08, desc: "받는 피해 -{v}%" },
    sturdy: { name: "강골", v: 0.08, desc: "최대 HP +{v}%" },
    nimble: { name: "날렵함", v: 0.06, desc: "회피율 +{v}%p, 피한 다음 공격은 위력 +30%" },
    riposte: { name: "받아치기", c: 0.3, desc: "공격받으면 {c}% 확률로 곧바로 받아친다 (위력 60%)" },
    thorns: { name: "가시", v: 0.45, desc: "공격받으면 받은 피해의 {v}%를 되돌려 준다" },
    lastStand: { name: "불굴", desc: "전투마다 한 번, 쓰러질 공격을 받아도 HP 1로 버틴다" },
    vigor: { name: "활력", v: 0.018, desc: "매 턴 최대 HP의 {v}%를 회복한다" },
    meditate: { name: "명상", v: 0.12, desc: "매 턴 MP 2% 회복, 방어하면 HP {v}%를 회복하고 MP를 두 배로 회복한다" },
    purify: { name: "정화", desc: "독·화상·쇠약·마비에 걸리지 않는다" },
    blessing: { name: "가호", v: 0.18, desc: "전투를 시작할 때 최대 HP {v}%의 보호막을 두른다" },
    foresight: { name: "예지", c: 0.2, desc: "{c}% 확률로 적의 공격을 미리 읽어 받는 피해를 절반으로 줄인다" },
    trick: { name: "속임수", c: 0.1, desc: "{c}% 확률로 적의 공격을 흘려 적이 제 몸을 치게 만든다" },
    firstAid: { name: "응급 처치", v: 0.28, desc: "HP가 35% 아래로 떨어지면 전투마다 한 번 HP {v}%를 회복한다" },
    rally: { name: "고무", v: 0.3, desc: "전투를 시작하면 3턴 동안 공격 +{v}%" },
    intimidate: { name: "위압", v: 0.35, desc: "전투를 시작하면 3턴 동안 적의 공격 -{v}%" },
    ally: { name: "동료", v: 0.65, desc: "전투를 시작하면 {ally} 3턴 동안 함께 싸운다 (위력 {v}%)" },
    cook: { name: "요리 솜씨", v: 0.12, desc: "물약 효과 +{v}%, 물약 하나로 HP와 MP를 함께 채운다" },
    harvest: { name: "수확", v: 0.25, v2: 0.5, desc: "적을 쓰러뜨리면 HP {v}%와 MP {v2}%를 회복한다" },
    forage: { name: "채집", c: 0.3, desc: "적을 쓰러뜨리면 {c}% 확률로 물약을 하나 만든다" },
    craftsman: { name: "장인 정신", v: 0.16, desc: "무기·방어구 강화 효과 +{v}%" }
  };

  /* 기본 직업 이름 그대로 정해 둔 특성(아래 낱말 규칙보다 먼저) */
  const TRAIT_EXACT = {
    "망령 암살자": "leech", "버섯 채집꾼": "forage", "견습 마법사": "gamble", "용병대장": "fortune",
    "궁병대장": "rally", "공성대장": "armorBreak", "약초꾼": "forage", "대사제": "blessing", "탈영병": "nimble",
    "오우거 투사": "sturdy", "미노타우로스 투사": "charge", "꽃의 마녀": "charmer", "철권가": "armorBreak",
    "길거리 싸움꾼": "frenzy", "그림자 무용수": "nimble", "태극권사": "riposte", "고해신부": "meditate",
    "금융왕": "fortune", "도둑왕": "plunder", "의병장": "lastStand", "피닉스 계약자": "vigor", "역병 의사": "venom",
    "반마법사": "riposte", "시체폭파술사": "spellPower", "보험업자": "fortune", "무기상": "craftsman", "신학자": "purify",
    "물리학자": "insight", "식물학자": "insight", "우편배달부": "nimble", "장의사": "hex", "굴뚝청소부": "trick", "청소부": "purify",
    "구두닦이": "fortune", "쥐잡이": "venom", "묘지기": "ally", "소금 채취꾼": "purify", "진주 잠수부": "forage", "해녀": "forage",
    "탈춤꾼": "trick", "성악가": "charmer", "침술사": "deadeye", "안마사": "vigor", "가정교사": "insight", "판소리꾼": "rally", "검시관": "insight"
  };

  /* 직업 이름 낱말 → 특성. 위에서부터 먼저 맞는 것을 쓴다 */
  const TRAIT_RULES = [
    ["giant", /거인살해|신살자|용사냥|거수|괴물사냥|마수사냥|고래사냥|해룡 사냥|신수 사냥|맹수사냥|공성포수/],
    ["insight", /마녀사냥|흡혈귀사냥|늑대인간사냥|악마사냥|유령사냥|마물학|추적자|첩자|정보상|전략가|첩보|척후|마도학자|^현자|^학자$|역사가|철학자|박물학자|천문학자|수학자|교수|수사관|탐정|지도제작/],
    ["thorns", /가시|장미기사|식물술사/],
    ["frenzy", /광전사|야만|혈검|배교|혼령 전사|변신술사|혈마법|^늑대인간$|^반마$|돌격대장|차력|계약술사/],
    ["executioner", /사형집행|처단|극검|심판관|장총|해결사|추적 살수|영혼 인도자|원혼 사냥꾼|검시관/],
    ["ambush", /암살|그림자 살수|정적의|그림자궁수|그림자술사|밤의 칼날|자객|비수/],
    ["charge", /용기사|창기병|중장기병|경기병|그리폰|페가수스|마상|팔극|코끼리|전차병|바이킹|화랑|글라이더/],
    ["momentum", /검투사|무투가|입식|킥복|전쟁무용|종자기사/],
    ["combo", /쌍검|쌍절곤|연사|연발|복서|표창|부메랑|저글러|카드술사|암영|장구잡이|산탄|검무|비도|암기|커틀러스|권법|벌떼|회오리|전투마법/],
    ["deadeye", /검성|신궁|^궁수$|저격수|장궁|해부|이 뽑기|점혈|방랑검객|낭인|사무라이|천궁|보석 광부|잠수부/],
    ["armorBreak", /도끼|철퇴|파괴|대검|포병|박격|드릴|철거|불협화음|굴착|채석|광부|폭파|공성/],
    ["stagger", /망치|레슬러|지진|중력|투석|그물|함정|지뢰|섬광|교살|뿌리술|닻|곤봉|북 주술|떡장수|대지술|전투사제|유술|시계탑|판사|거미|종지기/],
    ["pierce", /창술|석궁|투창|관통|작살|마탄|머스킷|뼈술|허무|혼백|퇴마 무사|차원/],
    ["bleedEdge", /채찍|사슬낫|칼잡이|톱니|수류탄|정육|이발|외과의|문신|밀렵|모피|가죽|칼 삼키는|가정교사/],
    ["venom", /독|역병|뱀|버섯|하수도|양봉|발효|곤충|비료/],
    ["scorch", /화염|용암|폭염|불쇼|폭탄|화약|태양|재의|화덕|양초|증기|^도공$|점등|향신료 요리|용인|용 조련|야경|정령궁수|빛의 사도/],
    ["chill", /빙결|서리|극빙|얼음|화재 진압|우물/],
    ["shock", /뇌전|뇌신|뇌우|전기술|폭풍술|기상학/],
    ["charmer", /무희|가희|세이렌|구미호|요정|배우|만담|외교관|보석상|제과|피리|자장가|악몽|성운|의상|매혹/],
    ["hex", /저주|부두|마녀$|가면 주술|진혼|일식|유령선|고리대금|골동품|금서|타락|심연|망령술|변이|늪지|판소리|초상화|언어학/],
    ["leech", /흡혈|흑기사|죽음의 기사|영혼술|영혼 결속|검귀|특이점|정수 추출|몬스터 요리|미식가|공생|그림자 인간/],
    ["spellPower", /대마법사|마탑주|원소군주|원소술사|마도사|마법기사|마궁사|마도총사|대정령|천사강림|운석|공허|시체폭파|달빛 드루이드|영계|수정술사|마도공학|기계신|강철 거신|대학자|마법사$/],
    ["manaFlow", /마나|룬술|문장술|마력 검사|수류술|현악|백과사전|사서|필사/],
    ["inspire", /주문각인|마에스트로|서사시|화가|조각가|^시인$|소설가|작곡가|서예가|발명가|극작가/],
    ["gamble", /도박|주사위|야바위|투기꾼|광대|혼돈|행운아|취권|광기의 연금|바텐더|장난의|모자 장인|타로/],
    ["trick", /사기꾼|환술|거울|복화술|협잡|변장|둔갑|이중간첩|위조|^마술사$|꿈길|모래술|꿈술/],
    ["foresight", /예언|신탁|점성|점쟁이|사주|관상|꿈해몽|시간술|영매|운명술|등대지기/],
    ["forage", /채집|산나물|심마니|도굴|어부|낚시|고고학|화석|사냥터 관리|사금|진주/],
    ["purify", /^사제$|정화|은빛|퇴마사|무녀|신관|성녀|약사|^의사$|한의|명의|성물|수녀|순례|성지기|달의 사제|온천/],
    ["firstAid", /치유사|위생병|군의관|간호|산파|요양|정비병|수의사|유모|응급/],
    ["blessing", /성기사|축복|천사 소환|천사혼혈|교황|부적술|조상|성배|결계|기도사|풍수/],
    ["bulwark", /방패|수호|근위|성벽|성당기사|국경|문지기|경비|공병|다리 건설|갑옷장인|골렘인|자동인형|백인대장|시종장|건축가/],
    ["ironSkin", /철갑|강철|금강|맹약|금속|해골 전사|거인혼혈/],
    ["sturdy", /장사|씨름|짐꾼|가마꾼|벽돌|대목|비계|도로|나무꾼|벌목|곰 조련|미장|석공|지붕/],
    ["lastStand", /^투사$|순교|성흔|결사|리치|되살아난|방랑기사/],
    ["vigor", /드루이드|계절|세계수|대지모신|기혈|차 재배|낙농|슬라임|^선인$|약초 재배|하프 성가|트렌트지기/],
    ["meditate", /수도사|무도승|탁발|기공|은둔|금욕|명상/],
    ["rally", /음유|군기|^장군$|기사단장|훈련교관|나팔|북잡이|토템|성전기사|인챈터|해적선장|풍년|커피|비약|이야기꾼/],
    ["intimidate", /군주|야수왕|권왕|사자춤|공포술|칠대양|천하제일|^왕$|사자 조련/],
    ["ally", /조련|소환사|네크로|악마술|늑대인도|샤먼|정령사|목동|소몰이|축산|양계|염소|말 사육|마구간|마부|사냥개|갱단|상단주|중개인|촌장|인형|꼭두각시|허수아비|그림자극|호문쿨루스|키메라 연금|태엽|골렘술|기계공학|별자리|강시|음양|풍선/],
    ["plunder", /도적|소매치기|강도|의적|금고털이|^해적|사략|약탈|무법자|까마귀/],
    ["fortune", /상인|행상|은행|환전|무역|노점|전당포|대지주|세리|경매|장물|밀수|현상금|보물|거리 악사|수맥|현자의 돌/],
    ["cook", /요리|제빵|치즈|찻집|취사|여관|목욕탕|양조|소믈리에|길거리 음식|꿀술/],
    ["harvest", /농부|벼농사|포도|과수원|거대 작물|개간|정원사|원예|조경/],
    ["craftsman", /대장장이|세공|목수|직조|재봉|제화|활장인|시계공|유리공|칠기|종이 장인|마도구 장인|목각|운하|측량|수선|악기 장인|가면 장인|염색/]
  ];

  /* 맞는 낱말이 없으면 대표 기술 유형으로. 값이 객체면 공격 능력치로 한 번 더 고른다 */
  const TRAIT_BY_TYPE = {
    strike: { str: "momentum", dex: "nimble", int: "spellPower", wis: "spellPower", luk: "fortune", vit: "sturdy" },
    multi: "combo", pierce: "pierce", crit: "deadeye", execute: "executioner", burn: "scorch", poison: "venom", bleed: "bleedEdge",
    curse: "hex", freeze: "chill", stun: "stagger", drain: "leech", mana: "manaFlow", gamble: "gamble", charm: "charmer",
    gold: { luk: "fortune", int: "fortune", any: "plunder" }, debuff: { int: "insight", wis: "insight", any: "armorBreak" },
    heal: "firstAid", regen: "vigor", buff: "rally", rage: "frenzy", shield: "bulwark", counter: "riposte", evade: "nimble",
    summon: "ally", sacrifice: "lastStand", nuke: { int: "spellPower", wis: "spellPower", any: "armorBreak" }
  };

  /* 동료 특성: 직업 이름에 맞는 동료 */
  const ALLY_NAMES = [
    [/양계/, "닭 떼"], [/목동|소몰이|축산|염소/, "양치기 개"], [/매 조련/, "매"], [/사냥개/, "사냥개"], [/늑대/, "늑대"],
    [/사자/, "사자"], [/용 조련/, "새끼 용"], [/말 사육|마부|마구간/, "말"], [/쥐/, "쥐 떼"], [/곤충/, "벌레 떼"],
    [/네크로|시체|뼈|강시|묘지/, "해골 병사"], [/악마/, "꼬마 악마"], [/정령|샤먼|토템/, "정령"], [/인형|꼭두각시|허수아비|복화술/, "인형"],
    [/태엽|기계|골렘/, "기계 인형"], [/호문쿨루스|키메라/, "호문쿨루스"], [/갱단|용병|의병|중개인|상단|촌장/, "부하"],
    [/트렌트/, "트렌트"], [/그림자/, "그림자"], [/별자리/, "별자리 정령"], [/해수/, "바다 짐승"], [/환수|마수/, "마수"],
    [/음양/, "식신"], [/풍선/, "풍선 인형"], [/천사/, "천사"], [/군단/, "군단병"]
  ];

  Object.assign(D, { WEAPON_STYLES, ATTACK_FITS, WEAPON_ATTACK, THROW_ATTACK, TRAITS, TRAIT_EXACT, TRAIT_RULES, TRAIT_BY_TYPE, ALLY_NAMES });
})(typeof window !== "undefined" ? window : globalThis);
