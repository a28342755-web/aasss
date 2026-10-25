/*
 * 삼천의 운명 — 속성, 등급, 기술 유형, 특성, 수식어(기원), 몬스터
 */
(function (root) {
  "use strict";
  const FATES = (root.FATES = root.FATES || {});

  const ELEMENTS = {
    phys: "물리", fire: "화염", ice: "냉기", bolt: "번개", earth: "대지",
    wind: "바람", light: "신성", dark: "암흑", nature: "자연", arcane: "비전"
  };

  /* 등급: 3,000개 직업을 점수순으로 줄 세운 뒤 위에서부터 정원만큼 배정한다 */
  const RARITIES = [
    { name: "일반", mul: 1.0, count: 1200 },
    { name: "고급", mul: 1.07, count: 840 },
    { name: "희귀", mul: 1.15, count: 510 },
    { name: "영웅", mul: 1.25, count: 270 },
    { name: "전설", mul: 1.38, count: 135 },
    { name: "신화", mul: 1.55, count: 45 }
  ];

  const STATS = ["str", "dex", "int", "wis", "vit", "luk"];
  const STAT_NAMES = { str: "힘", dex: "민첩", int: "지능", wis: "정신", vit: "체력", luk: "행운" };

  /* 기술 유형: 위력(mult)은 주 능력치 기반 공격력에 대한 배율 */
  const SKILL_TYPES = {
    strike: { label: "강타", mult: 1.7, cost: 8, cd: 1 },
    multi: { label: "연타", mult: 0.62, hits: 3, cost: 10, cd: 2 },
    pierce: { label: "관통", mult: 1.5, pen: 0.7, cost: 9, cd: 1 },
    crit: { label: "급소", mult: 1.35, critBonus: 0.45, cost: 8, cd: 1 },
    execute: { label: "처형", mult: 1.2, cost: 10, cd: 2 },
    burn: { label: "화상", mult: 1.0, dot: "burn", dotPow: 0.3, t: 3, cost: 9, cd: 2 },
    poison: { label: "중독", mult: 0.7, dot: "poison", dotPow: 0.24, t: 4, cost: 8, cd: 2 },
    bleed: { label: "출혈", mult: 1.0, dot: "bleed", dotPow: 0.26, t: 3, cost: 8, cd: 2 },
    stun: { label: "기절", mult: 1.0, chance: 0.55, cost: 10, cd: 3 },
    freeze: { label: "빙결", mult: 1.1, chance: 0.45, cost: 10, cd: 3 },
    drain: { label: "흡수", mult: 1.3, drain: 0.5, cost: 10, cd: 2 },
    heal: { label: "치유", heal: 0.32, cost: 12, cd: 3 },
    regen: { label: "재생", regen: 0.1, t: 4, cost: 10, cd: 4 },
    buff: { label: "강화", up: 0.4, t: 3, cost: 8, cd: 4 },
    rage: { label: "광폭", up: 0.7, t: 3, cost: 6, cd: 4 },
    shield: { label: "보호막", shield: 0.28, cost: 10, cd: 4 },
    counter: { label: "반격", t: 2, cost: 9, cd: 4 },
    evade: { label: "회피", mult: 0.6, t: 2, cost: 7, cd: 4 },
    debuff: { label: "약화", mult: 0.6, t: 3, cost: 8, cd: 3 },
    curse: { label: "저주", mult: 0.5, dotPow: 0.15, t: 4, cost: 10, cd: 3 },
    gold: { label: "강탈", mult: 1.1, cost: 6, cd: 2 },
    summon: { label: "소환", pow: 0.5, t: 3, cost: 12, cd: 4 },
    gamble: { label: "도박", cost: 6, cd: 1 },
    mana: { label: "마나", mult: 0.8, mana: 0.22, cost: 0, cd: 3 },
    nuke: { label: "대기술", mult: 2.6, cost: 22, cd: 4 },
    sacrifice: { label: "희생", mult: 2.4, hpCost: 0.14, cost: 0, cd: 3 },
    charm: { label: "혼란", mult: 0.4, t: 2, cost: 10, cd: 3 }
  };

  /* 특성 문구: {p}는 백분율, {n}은 정수 */
  const PASSIVES = {
    hp: "최대 HP +{p}%",
    mp: "최대 MP +{p}%",
    dmg: "주는 피해 +{p}%",
    resist: "받는 피해 -{p}%",
    def: "방어력 +{p}%",
    crit: "치명타 확률 +{p}%p",
    eva: "회피율 +{p}%p",
    gold: "골드 획득 +{p}%",
    exp: "경험치 획득 +{p}%",
    regen: "매 턴 HP {p}% 회복",
    mregen: "매 턴 MP {p}% 회복",
    steal: "준 피해의 {p}% 흡혈",
    dot: "지속 피해 +{p}%",
    heal: "회복 효과 +{p}%",
    disc: "상점 가격 -{p}%",
    post: "전투 승리 후 HP {p}% 회복",
    double: "{p}% 확률로 추가 공격",
    first: "첫 턴 피해 +{p}%",
    barrier: "전투 시작 시 최대 HP {p}% 보호막",
    weak: "약점 속성 피해 +{p}%p, 적 약점 간파",
    boss: "보스에게 주는 피해 +{p}%",
    pot: "물약 효과 +{p}%",
    pen: "적 방어력 {p}% 무시",
    dur: "강화·약화 지속 +{n}턴",
    drop: "전리품 발견 확률 +{p}%p",
    summon: "소환수 피해 +{p}%",
    inn: "여관 무료",
    revive: "한 번 쓰러져도 되살아남"
  };

  /*
   * 수식어(기원): 기본 직업 앞에 붙어 변종 직업을 만든다. "북방 광전사", "엘프 양봉가" 등.
   * 형식: 이름|티어(0~3)|속성|능력치 보정|특성|기술명|기술 유형|설명|플래그|제외 키워드
   *   플래그 c = 전투 계열 전용, n = 생활 계열 전용
   */
  const MODIFIERS = `
화염|1|fire|str+1,int+1|dmg:0.06|화염 폭발|burn|불꽃의 기운이 깃들어 기술에 화염이 붙는다||
용암|2|fire|str+2,vit+1,dex-1|dot:0.25|용암 분출|burn|들끓는 용암의 힘을 지녔다||
서리|1|ice|int+1,wis+1|resist:0.05|서리 폭풍|freeze|몸에서 늘 냉기가 흘러나온다||
빙하|2|ice|vit+2,int+1,dex-1|def:0.15|빙하 낙하|freeze|만년설의 냉기를 품었다||
뇌전|1|bolt|dex+1,int+1|crit:0.04|연쇄 번개|stun|번개를 몸에 휘감고 다닌다||
폭풍|2|bolt|dex+2,luk+1|double:0.08|폭풍 강타|multi|폭풍의 축복을 받았다||
대지|1|earth|vit+2|def:0.1|대지 강타|stun|대지의 힘이 몸을 단단하게 한다||
바위|1|earth|vit+1,str+1,dex-1|resist:0.06|바위 투척|strike|바위처럼 굳건하다||
바람|1|wind|dex+2|eva:0.04|바람 칼날|multi|바람처럼 가볍게 움직인다||
질풍|2|wind|dex+2,luk+1|double:0.1|질풍 난격|multi|눈에 보이지 않는 속도를 얻었다||
빛|1|light|wis+2|heal:0.15|빛의 창|pierce|빛의 가호를 받는다||
태양|2|light|wis+1,str+1,int+1|regen:0.02|태양 강림|burn|태양의 열기와 빛을 품었다||
어둠|1|dark|int+1,luk+1|steal:0.04|암흑 파동|drain|어둠의 속삭임을 듣는다||
그림자|1|dark|dex+2|eva:0.05|그림자 습격|crit|그림자와 하나가 되었다||
심연|2|dark|int+2,vit+1,wis-1|dmg:0.08|심연의 손아귀|curse|심연을 들여다보고 돌아왔다||
독|1|nature|dex+1,int+1|dot:0.2|맹독 살포|poison|몸에 독을 품고 산다||
역병|2|nature|int+2,vit+1|dot:0.3|역병 확산|poison|역병을 퍼뜨리는 존재가 되었다||
가시|1|nature|vit+1,dex+1|dot:0.15|가시 덩굴|bleed|몸에 가시가 돋아 있다||
꽃|1|nature|wis+1,luk+1|heal:0.15|꽃잎 폭풍|charm|꽃의 정령에게 사랑받는다||
비전|1|arcane|int+2|mp:0.2|비전 탄막|multi|비전 마력이 흘러넘친다||
수정|2|arcane|int+1,wis+1,vit+1|barrier:0.1|수정 방벽|shield|몸 일부가 수정으로 변했다||
별빛|2|light|luk+2,int+1|crit:0.05|별똥별|strike|별빛을 머금고 태어났다||
월광|1|light|wis+1,dex+1|mregen:0.04|달빛 베기|crit|달빛 아래에서 강해진다||
핏빛|2|dark|str+2,vit+1,wis-1|steal:0.06|피의 갈망|sacrifice|피의 힘에 눈을 떴다||
강철|1|phys|vit+2,str+1,dex-1|def:0.12|강철 돌진|stun|강철처럼 단련된 몸을 가졌다||
영혼|2|arcane|wis+2,int+1|mregen:0.05|영혼 폭발|nuke|영혼의 힘을 다룰 수 있다||
안개|1|wind|luk+1,dex+1|eva:0.05|안개 장막|evade|안개처럼 실체를 흐린다||
잿빛|1|fire|vit+1,wis+1|resist:0.05|잿가루 폭풍|debuff|모든 것이 타고 남은 재 속에서 일어났다||
북방|0||vit+2,str+1,int-1|hp:0.1|북풍 함성|buff|혹독한 북방 설원에서 단련되었다||
사막|0||vit+1,dex+1|resist:0.05|모래 바람|debuff|뜨거운 사막에서 살아남았다||
동방|0||dex+1,wis+1|crit:0.03|동방 비기|crit|먼 동방의 기술을 익혔다||
정글|0|nature|dex+2|dot:0.1|독개구리 즙|poison|울창한 정글에서 자랐다||
설원|0|ice|vit+2|resist:0.05|눈사태|freeze|끝없는 설원 출신이다||
해안|0||dex+1,luk+1|gold:0.1|파도 타기|evade|바닷바람을 맞으며 자랐다||
산악|0||vit+1,str+1|hp:0.08|낙석|stun|험준한 산악 부족 출신이다||
지하도시|0|dark|int+1,dex+1|eva:0.03|어둠 속 기습|crit|햇빛 없는 지하도시에서 자랐다||
천공섬|1|wind|dex+1,wis+1|eva:0.04|낙하 강습|strike|하늘에 떠 있는 섬 출신이다||
늪지|0|nature|vit+1,wis+1|dot:0.1|늪 진흙|debuff|안개 낀 늪지에서 자랐다||
초원|0||dex+1,vit+1|exp:0.08|초원 질주|multi|끝없는 초원을 달리던 유목민이다||
화산섬|1|fire|str+1,vit+1|dmg:0.04|화산탄|burn|불을 뿜는 화산섬 출신이다||
황야|0||luk+1,vit+1|post:0.08|황야의 생존술|regen|무법의 황야를 떠돌았다||
왕도|0||int+1,luk+1|gold:0.15|왕도의 인맥|buff|번화한 왕도 출신이다||
변경|0||str+1,vit+1|resist:0.04|변경 수비술|shield|마물과 맞닿은 변경 출신이다||
항구|0||luk+1,dex+1|gold:0.1|뒷골목 주먹질|multi|온갖 사람이 오가는 항구 출신이다||
빈민가|0||dex+1,luk+1|gold:0.08|빈민가 생존술|evade|빈민가에서 살아남았다||
수도원|0|light|wis+2|regen:0.015|수도원 기도|heal|수도원에서 길러졌다||
엘프|1||dex+2,int+1,vit-1|crit:0.03|엘프의 지혜|buff|숲의 장수 종족 엘프다||
다크엘프|1|dark|dex+1,int+2,wis-1|dmg:0.05|어둠의 칼날|crit|지하 세계의 다크엘프다||
드워프|0|earth|vit+2,str+1,dex-1|def:0.1|드워프 망치질|stun|산속 대장간의 종족 드워프다||
오크|0||str+3,int-1|dmg:0.05|오크의 함성|rage|힘을 숭상하는 오크다||
하플링|0||luk+2,dex+1,str-1|eva:0.05|하플링의 행운|gamble|작고 날랜 하플링이다||
수인|0||dex+1,str+1|double:0.06|야수의 발톱|bleed|짐승의 피가 흐르는 수인이다||
용인|2|fire|str+1,vit+1,int+1|hp:0.1|용의 숨결|burn|용의 비늘을 지닌 용인이다||
거인족|1||str+2,vit+2,dex-2|hp:0.15|거인의 일격|strike|거대한 거인족이다||
요정|1|nature|luk+1,wis+1,int+1,vit-1|mregen:0.04|요정 가루|charm|날개 달린 작은 요정이다||
언데드|1|dark|vit+1,int+1,wis-1|resist:0.06|죽음의 손길|drain|죽음에서 깨어난 언데드다||되살아난
리자드맨|0|nature|vit+1,dex+1|regen:0.015|꼬리 후려치기|stun|늪지의 리자드맨이다||
노움|0||int+2,luk+1,str-1|disc:0.1|노움의 발명품|gamble|기계를 사랑하는 노움이다||
고블린|0||dex+1,luk+2,vit-1|gold:0.15|고블린 꼼수|gold|약삭빠른 고블린이다||
켄타우로스|1||dex+1,str+1,vit+1|first:0.25|질주 돌격|strike|반인반마 켄타우로스다||기병,기수,말
인어족|1|ice|dex+1,wis+1|regen:0.015|물보라|evade|바다의 인어족이다||
트롤|1||vit+3,int-1|regen:0.03|트롤 재생|regen|무엇이든 재생하는 트롤이다||
고양이족|0||dex+2,luk+1,str-1|eva:0.05|고양이 할퀴기|multi|날렵한 고양이족이다||
천사혈통|2|light|wis+2,vit+1|heal:0.2|천사의 날개|heal|천사의 피를 이었다||천사
악마혈통|2|dark|str+1,int+2|dmg:0.08|악마의 낙인|curse|악마의 피를 이었다||악마,반마
방랑|0||luk+1,vit+1|exp:0.08|방랑자의 지혜|buff|정처 없이 떠도는 방랑자다||떠돌,유랑
왕실|1||int+1,luk+1,wis+1|gold:0.12|왕실의 위엄|charm|왕실에 소속된 정예다||왕,궁정,궁중,근위
용병|0||str+1,dex+1|gold:0.12|돈값 하기|strike|돈을 받고 싸우는 용병이다||
은둔|1||wis+2|mregen:0.03|은둔 비기|crit|세상을 등지고 홀로 수련했다||
타락한|1|dark|str+1,int+1,wis-1|dmg:0.07|타락의 힘|rage|신념을 버리고 타락했다||배교
신성한|1|light|wis+2|heal:0.15|신성한 가호|shield|신의 축복을 받았다||성기사,성전,성당,성궁,성배,성녀,성흔,성물,성지
저주받은|1|dark|luk-1,str+2,int+1|dmg:0.08|저주 전이|curse|풀리지 않는 저주를 짊어졌다||
광기의|1||str+2,wis-1,dex+1|double:0.08|광기 폭주|rage|광기에 사로잡혔다||광전사
고대|2|arcane|int+1,wis+1,vit+1|mp:0.2|고대의 비술|nuke|잊혀진 고대의 기술을 계승했다||
기계|1|bolt|int+1,vit+1|barrier:0.08|기계 팔|strike|몸 일부를 기계로 개조했다||의수,태엽,자동인형
증기|1|fire|int+1,vit+1|def:0.08|증기 분출|burn|증기 기관의 힘을 쓴다||
유령|1|dark|dex+1,int+1,vit-1|eva:0.06|유령 통과|evade|반쯤 유령이 된 존재다||망령
해적|0||str+1,luk+1|gold:0.15|약탈|gold|해적 출신이다||선장
군단|0||vit+1,str+1|resist:0.05|군단 진형|shield|제국 군단에서 복무했다|c|
황금|1||luk+3|gold:0.25|황금 세례|gold|손대는 것마다 황금이 된다||
귀족|0||int+1,luk+1|gold:0.1|귀족의 품격|buff|귀족 가문 출신이다||
서커스|0||dex+2|eva:0.04|서커스 묘기|evade|유랑 서커스단 출신이다||곡예,광대,저글러
궁정|0||int+1,wis+1|exp:0.08|궁정 예법|charm|왕궁에서 일한다|n|궁중,왕,재상,시종
시골|0||vit+1,luk+1|post:0.08|시골 인심|heal|조용한 시골 마을 출신이다|n|
길드|0||int+1,dex+1|disc:0.08|길드 비법|buff|길드의 공인을 받은 숙련자다|n|
거장|2||int+1,dex+1,luk+1|exp:0.12|거장의 손길|crit|자기 분야의 정점에 선 거장이다|n|전설의
떠돌이|0||luk+1,dex+1|gold:0.08|떠돌이 요령|evade|여러 마을을 떠도는 떠돌이다|n|행상,순례
혁명|1||str+1,luk+1|dmg:0.05|봉기의 함성|buff|부패한 왕정에 맞선 혁명가다||왕
망국|1||vit+1,wis+1|resist:0.05|망국의 한|curse|멸망한 왕국의 생존자다||
몽환|1|arcane|wis+1,luk+1|eva:0.04|몽환의 안개|charm|꿈과 현실의 경계를 걷는다||꿈
쌍둥이|1||dex+1,luk+1|double:0.1|쌍둥이 협공|multi|언제나 쌍둥이와 함께 싸운다||
맹인|1||wis+2,dex+1,luk-1|crit:0.05|심안|crit|눈을 잃은 대신 마음의 눈을 떴다||
백전노장|1||vit+1,str+1,wis+1|resist:0.06|노장의 관록|counter|수많은 싸움을 겪은 노장이다||
신동|1||int+2,luk+1|exp:0.15|신동의 번뜩임|crit|어린 나이에 재능을 꽃피웠다||아이
용혈|3|fire|str+2,vit+2,int+1|hp:0.15,dmg:0.05|용혈 각성|nuke|고대 용의 피가 흐른다||용
천상|3|light|wis+2,int+1,luk+1|regen:0.03|천상의 심판|nuke|천상계에서 내려왔다||천사
공허|3|dark|int+3,luk+1|pen:0.2|공허의 문|pierce|공허와 계약했다||
시공|3|arcane|int+2,dex+2|double:0.12|시간 가속|multi|시간과 공간의 틈을 걷는다||시간,시계,차원
혼돈|3|arcane|luk+3,int+1|crit:0.08|혼돈의 주사위|gamble|혼돈의 신에게 선택받았다||
세계수|3|nature|wis+2,vit+2|regen:0.03,heal:0.2|세계수의 생명|regen|세계수의 씨앗을 품고 태어났다||
불사조|3|fire|vit+2,wis+2|revive:1|불사조의 불꽃|burn|불사조의 깃털을 지녔다||피닉스,되살아난
운명|3||luk+4|crit:0.06,gold:0.2|운명 개변|execute|운명의 여신이 지켜본다||예언
신격|3|light|str+1,dex+1,int+1,wis+1,vit+1,luk+1|dmg:0.1|신격 해방|nuke|신의 경지에 한 발을 들였다||신궁,신관,신살,신탁,신학,신수,뇌신,기계신
태초|3|arcane|vit+2,int+2|barrier:0.15|태초의 빛|nuke|세계가 시작될 때부터 존재했다||
종말|3|dark|str+3,int+2,wis-1|dmg:0.12|종말의 나팔|nuke|종말을 예고하는 존재다||
성좌|3|light|luk+2,wis+2|crit:0.05,exp:0.1|성좌 강림|strike|별자리의 화신이다||별
마왕|3|dark|str+2,int+2,vit+1|steal:0.08|마왕의 권능|nuke|마왕의 힘을 계승했다||암흑군주
정령왕|3|wind|wis+3,int+1|mregen:0.05|정령왕 강림|summon|정령왕의 총애를 받는다||
`;

  /*
   * 몬스터 형식: 이름|단계(0~4)|속성|약점|저항|특성(쉼표)|HP배율|공격배율|방어배율|보스(B)
   *   단계 0 = 1~10층, 1 = 11~20층 … 4 = 41층 이상
   */
  const MONSTERS = `
슬라임|0|nature|fire|nature|none|0.8|0.8|0.6
고블린|0|phys|fire||steal|0.9|1.0|0.8
거대 쥐|0|phys|fire|nature|poison|0.7|0.9|0.6
굶주린 늑대|0|phys|fire||multi|0.9|1.0|0.7
흡혈 박쥐|0|dark|light|dark|drain|0.7|0.9|0.6
코볼트 광부|0|earth|wind|earth|heavy|1.0|0.9|1.1
독버섯 괴물|0|nature|fire|nature|poison|1.0|0.8|0.9
해골 병사|0|dark|light|dark|none|1.0|1.0|1.0
성난 멧돼지|0|phys|ice||heavy|1.1|1.0|0.9
산적|0|phys|bolt||steal|1.0|1.0|0.9
고블린 족장|0|phys|fire||enrage,steal|1.0|1.0|1.0|B
거대 슬라임 왕|0|nature|fire|nature|heal,poison|1.1|0.9|0.8|B
오크 전사|1|phys|arcane||heavy|1.1|1.05|1.0
거대 거미|1|nature|fire|nature|poison|0.9|1.0|0.9
썩은 좀비|1|dark|fire|dark|poison|1.2|0.9|0.8
하피|1|wind|bolt|wind|multi|0.85|1.05|0.8
리자드맨 전사|1|nature|ice|nature|none|1.0|1.0|1.1
그렘린|1|bolt|earth|bolt|steal|0.8|1.0|0.8
늑대인간|1|phys|light||enrage|1.0|1.1|0.9
화염 정령|1|fire|ice|fire|burn|0.9|1.05|0.8
얼음 정령|1|ice|fire|ice|stun|0.9|1.0|0.9
원한의 망령|1|dark|light|phys|drain|0.85|1.0|0.7
거미 여왕|1|nature|fire|nature|poison,stun|1.0|1.0|1.0|B
오크 대족장|1|phys|arcane||enrage,heavy|1.1|1.05|1.0|B
트롤|2|phys|fire||heal|1.25|1.0|0.9
미노타우로스|2|phys|arcane||heavy|1.15|1.1|1.0
가고일|2|earth|bolt|phys|none|1.0|1.0|1.3
와이번|2|wind|ice|wind|poison|1.0|1.1|0.9
뱀파이어|2|dark|light|dark|drain|0.95|1.05|0.9
바위 골렘|2|earth|bolt|phys|stun|1.3|0.95|1.3
나가|2|ice|bolt|ice|poison|1.0|1.0|1.0
켄타우로스 궁수|2|wind|earth|wind|multi|0.9|1.1|0.8
암흑 기사|2|dark|light|dark|heavy|1.1|1.05|1.2
늪지 마녀|2|nature|fire|dark|weaken|0.85|1.05|0.8
리치|2|dark|light|dark|drain,weaken|1.0|1.05|1.0|B
미궁의 황소왕|2|phys|arcane||heavy,enrage|1.15|1.05|1.0|B
오우거|3|phys|arcane||heavy|1.25|1.1|0.9
키메라|3|fire|ice|fire|burn|1.05|1.1|0.9
바실리스크|3|earth|wind|earth|stun|1.0|1.0|1.2
서큐버스|3|dark|light|dark|weaken|0.9|1.05|0.8
만티코어|3|nature|ice|nature|poison|1.0|1.1|0.9
강철 골렘|3|phys|bolt|phys|none|1.3|1.0|1.4
듀라한|3|dark|light|dark|heavy|1.05|1.1|1.1
크라켄의 촉수|3|ice|bolt|ice|multi|1.0|1.0|0.9
화염 거인|3|fire|ice|fire|heavy|1.3|1.1|1.0
서리 거인|3|ice|fire|ice|stun|1.3|1.05|1.0
히드라|3|nature|fire|nature|heal,multi|1.1|1.0|1.0|B
서리 여왕|3|ice|fire|ice|stun,weaken|1.0|1.05|1.0|B
상급 악마|4|fire|light|fire|burn|1.05|1.1|1.0
베헤모스|4|earth|wind|earth|heavy|1.35|1.05|1.2
데스 나이트|4|dark|light|dark|drain|1.1|1.1|1.2
타락천사|4|light|dark|light|weaken|1.0|1.1|1.0
심연의 촉수|4|dark|light|dark|multi|1.0|1.05|0.9
시간의 파수꾼|4|arcane|dark|arcane|stun|1.0|1.0|1.1
혼돈의 마수|4|arcane|light|arcane|heavy|1.15|1.1|1.0
폭풍 거인|4|bolt|earth|bolt|stun|1.3|1.05|1.0
불사조|4|fire|ice|fire|heal|1.0|1.05|0.9
그림자 용|4|dark|light|dark|multi|1.2|1.1|1.1
고룡|4|fire|ice|fire|burn,enrage|1.15|1.05|1.1|B
마왕의 그림자|4|dark|light|dark|drain,weaken|1.1|1.05|1.0|B
공허의 군주|4|arcane|light|arcane|heavy,stun|1.15|1.05|1.0|B
`;

  const HERO_NAMES = [
    "아린", "카엘", "루시엔", "도담", "세라", "바론", "미르", "하람", "이안", "레온",
    "소하", "엘라", "단", "유리", "가온", "리안", "테오", "노을", "한결", "시아",
    "로웬", "다온", "카렌", "무진", "에단", "솔", "하율", "베른", "나비", "라엘"
  ];

  FATES.data = { ELEMENTS, RARITIES, STATS, STAT_NAMES, SKILL_TYPES, PASSIVES, MODIFIERS, MONSTERS, HERO_NAMES };
})(typeof window !== "undefined" ? window : globalThis);
