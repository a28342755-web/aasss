/*
 * 삼천의 운명 — 주인공 그림 고르기
 * 캐릭터 그림은 계열마다 1~5가지(모두 90가지)를 미리 그려 두고(assets/heroes/*.webp),
 * 직업 이름의 낱말로 가장 어울리는 그림을 고른다. 맞는 낱말이 없으면 그 계열의 첫 그림.
 */
(function (root) {
  "use strict";
  const F = root.FATES;

  /* [그림 id, 계열 id, 직업 이름에서 찾을 낱말] — 위에서부터 먼저 맞는 것을 쓴다 */
  const ART = [
    ["w_berserker", "warrior", /광전사|야만|바이킹|도끼|파괴자|전쟁군주/],
    ["w_gladiator", "warrior", /검투사|투사|방패|철갑|용병|거인살해|망치/],
    ["w_spear", "warrior", /창|채찍|사슬낫/],
    ["w_twin", "warrior", /쌍검|검무|혈검/],
    ["w_sword", "warrior", /검|결투/],
    ["k_dark", "knight", /흑기사|죽음|배교|심연/],
    ["k_lancer", "knight", /용기사|창기병|그리폰|페가수스|마상|군기|종자/],
    ["k_rose", "knight", /장미|마법기사|맹약/],
    ["k_paladin", "knight", /./],
    ["a_hunter", "archer", /저격|석궁|독화살|표창|투창|부메랑|투석|그림자|추적|그물|관통/],
    ["a_elf", "archer", /./],
    ["g_bomber", "gunner", /포병|폭탄|박격포|화염방사|지뢰|수류탄|섬광탄|화약술사|공성/],
    ["g_slinger", "gunner", /./],
    ["r_trickster", "rogue", /사기꾼|밀수|갱단|장물|위조|야바위|해결사|금고|도굴/],
    ["r_thief", "rogue", /./],
    ["s_kunoichi", "assassin", /은형|변장|첩자|이중간첩|정보상/],
    ["s_shadow", "assassin", /독|교살|망령|처단|비수/],
    ["s_ninja", "assassin", /./],
    ["e_fire", "elemental", /화염|용암|폭염|재의/],
    ["e_ice", "elemental", /빙결|서리|극빙|수정/],
    ["e_water", "elemental", /수류|안개/],
    ["e_storm", "elemental", /뇌전|폭풍|바람|회오리|뇌신/],
    ["e_earth", "elemental", /./],
    ["m_witch", "arcane", /마녀|환술|인챈터|변이/],
    ["m_rune", "arcane", /룬|결계|중력|공간|문장|각인|마력 검사|전투마법|반마법|마나 포식/],
    ["m_sage", "arcane", /현자|대마법사|마탑주|마도학자/],
    ["m_wizard", "arcane", /./],
    ["d_blood", "dark", /혈|흡혈|악마|계약|암흑군주|타락/],
    ["d_curse", "dark", /저주|부두|역병|공포|악몽/],
    ["d_reaper", "dark", /망령|허무|영혼|그림자/],
    ["d_necro", "dark", /./],
    ["h_angel", "holy", /천사|빛의 사도|성흔/],
    ["h_inquisitor", "holy", /퇴마|심판|전투사제|정화|태양/],
    ["h_nun", "holy", /성녀|치유|축복|무녀|달의/],
    ["h_priest", "holy", /./],
    ["n_beast", "nature", /변신|야수|늑대|벌떼|공생/],
    ["n_flower", "nature", /식물|버섯|가시|독초|꽃|늪지/],
    ["n_druid", "nature", /./],
    ["sp_medium", "spirit", /정령사|영매|꿈길|영혼|혼백|대정령|부적|원혼|조상|영계/],
    ["sp_shaman", "spirit", /./],
    ["ma_girl", "martial", /태극|경공|점혈|유술|취권/],
    ["ma_boxer", "martial", /복서|킥복|레슬러|길거리|입식|철권|씨름|장사|무투가/],
    ["ma_monk", "martial", /./],
    ["su_dragon", "summoner", /용 조련|피닉스|환수|해수/],
    ["su_tamer", "summoner", /조련사|까마귀/],
    ["su_summoner", "summoner", /./],
    ["b_dancer", "bard", /무희|가희|세이렌|무용수|자장가|사자춤|북잡이|나팔|장구/],
    ["b_bard", "bard", /./],
    ["t_mech", "tech", /골렘|드릴|거신|톱니|의수|전기|마도공학|기계신/],
    ["t_engineer", "tech", /./],
    ["al_mad", "alchemy", /독|호문쿨루스|키메라|광기|투척|연기/],
    ["al_alch", "alchemy", /./],
    ["o_miko", "oriental", /무녀|무당|부채/],
    ["o_taoist", "oriental", /도사|선인|검선|음양|강시|둔갑/],
    ["o_warrior", "oriental", /화랑|협객|언월도|봉술|비도|쌍절곤|암기/],
    ["o_samurai", "oriental", /./],
    ["hu_slayer", "hunter", /용사냥꾼|거수|마수사냥꾼|신수/],
    ["hu_hunter", "hunter", /^사냥꾼|덫|추적|맹수|보물|밀렵|사냥개|현상금/],
    ["hu_monster", "hunter", /./],
    ["se_sailor", "sea", /작살|고래|해병|잠수|심해|조류|해룡|항해|닻|해무/],
    ["se_pirate", "sea", /./],
    ["mi_soldier", "military", /척후|보병|근위|기병|공병|위생|전차|교관|탈영|결사|코끼리/],
    ["mi_general", "military", /./],
    ["c_time", "cosmic", /시간|차원|평행세계/],
    ["c_astro", "cosmic", /점성|예언|운명|별자리|성운|오로라|월광|태양/],
    ["c_void", "cosmic", /./],
    ["tr_acrobat", "trickster", /곡예|저글러|풍선/],
    ["tr_puppet", "trickster", /인형|그림자극|복화술/],
    ["tr_magician", "trickster", /마술|도박|카드|주사위|행운|거울|꿈|협잡|혼돈/],
    ["tr_jester", "trickster", /./],
    ["bl_mermaid", "bloodline", /인어/],
    ["bl_fox", "bloodline", /구미호|반요|하피|천사/],
    ["bl_vamp", "bloodline", /흡혈|고르곤|되살아난|해골|그림자|반마/],
    ["bl_dragon", "bloodline", /용인|슬라임|버섯|골렘|키메라/],
    ["bl_wolf", "bloodline", /./],
    ["fa_bee", "farming", /양봉|누에/],
    ["fa_herder", "farming", /목동|소몰이|축산|양계|염소|말 사육|낙농/],
    ["fa_farmer", "farming", /./],
    ["ga_fisher", "gathering", /어부|낚시|진주|해녀|갯벌|소금|잠수/],
    ["ga_miner", "gathering", /./],
    ["cr_smith", "craft", /./],
    ["cu_chef", "culinary", /./],
    ["co_merchant", "commerce", /./],
    ["sc_scholar", "scholar", /./],
    ["ar_painter", "arts", /./],
    ["me_doctor", "medicine", /./],
    ["ci_guard", "civic", /./],
    ["sv_maid", "service", /./],
    ["bu_builder", "building", /./],
    ["my_fortune", "mystic", /./],
  ];

  /* 그림마다 싸우는 방식: reach(근접·활·총·마법·던지기), shot(날아가는 것), ult(궁극기 연출) */
  const STYLE_BY_PREFIX = {
    w: { reach: "melee", ult: "blade" }, k: { reach: "melee", ult: "blade" }, r: { reach: "melee", ult: "blade" }, s: { reach: "melee", ult: "blade" },
    a: { reach: "bow", shot: "arrow", ult: "arrows" }, g: { reach: "gun", shot: "bullet", ult: "bombard" },
    e: { reach: "magic", shot: "orb", ult: "element" }, m: { reach: "magic", shot: "orb", ult: "element" }, d: { reach: "magic", shot: "orb", ult: "element" },
    h: { reach: "magic", shot: "orb", ult: "element" }, n: { reach: "magic", shot: "orb", ult: "element" }, sp: { reach: "magic", shot: "talisman", ult: "element" },
    su: { reach: "magic", shot: "orb", ult: "element" }, bl: { reach: "melee", ult: "blade" }, ma: { reach: "melee", ult: "blade" }, o: { reach: "melee", ult: "blade" },
    b: { reach: "throw", shot: "note", ult: "notes" }, tr: { reach: "throw", shot: "card", ult: "cards" }, t: { reach: "gun", shot: "bullet", ult: "bombard" },
    al: { reach: "throw", shot: "flask", ult: "bombard" }, hu: { reach: "bow", shot: "arrow", ult: "arrows" }, se: { reach: "melee", ult: "blade" },
    mi: { reach: "melee", ult: "blade" }, c: { reach: "magic", shot: "orb", ult: "element" }, fa: { reach: "melee", ult: "blade" }, ga: { reach: "melee", ult: "blade" },
    cr: { reach: "melee", ult: "blade" }, cu: { reach: "melee", ult: "blade" }, co: { reach: "throw", shot: "coin", ult: "coins" }, sc: { reach: "magic", shot: "orb", ult: "element" },
    ar: { reach: "throw", shot: "paint", ult: "element" }, me: { reach: "magic", shot: "orb", ult: "element" }, ci: { reach: "melee", ult: "blade" },
    sv: { reach: "melee", ult: "blade" }, bu: { reach: "melee", ult: "blade" }, my: { reach: "magic", shot: "orb", ult: "element" }
  };
  const STYLE_BY_ID = {
    o_taoist: { reach: "magic", shot: "talisman", ult: "element" }, o_miko: { reach: "magic", shot: "talisman", ult: "element" },
    bl_fox: { reach: "magic", shot: "orb", ult: "element" }, hu_slayer: { reach: "melee", ult: "blade" }, hu_hunter: { reach: "melee", ult: "blade" },
    t_engineer: { reach: "melee", ult: "bombard" }, t_mech: { reach: "melee", ult: "bombard" }, tr_jester: { reach: "throw", shot: "ball", ult: "cards" },
    tr_acrobat: { reach: "melee", ult: "blade" }, b_dancer: { reach: "melee", ult: "notes" }, fa_bee: { reach: "throw", shot: "flask", ult: "element" },
    ga_fisher: { reach: "melee", ult: "blade" }, g_bomber: { reach: "gun", shot: "bomb", ult: "bombard" }, se_pirate: { reach: "melee", ult: "bombard" }
  };
  function styleOf(job) {
    const id = heroArtId(job);
    return STYLE_BY_ID[id] || STYLE_BY_PREFIX[id.split("_")[0]] || { reach: "melee", ult: "blade" };
  }

  /* 생활 계열은 그림이 계열마다 한두 가지뿐이라, 이름이 더 잘 맞는 다른 계열 그림을 빌려 쓴다
     (나무꾼 → 도끼 전사, 철거공 → 폭탄병, 간호사 → 치유 수녀). 기본 직업 이름과 정확히 맞아야 한다 */
  const LEND = {
    sv_maid: ["재봉사", "직조공", "염색공", "수선공", "모자 장인", "가정교사", "의상 디자이너"],
    a_hunter: ["활장인"], hu_hunter: ["가죽장인", "제화공", "사냥터 관리인", "모피 사냥꾼"],
    co_merchant: ["길거리 음식 장수"], k_rose: ["외교관"],
    al_alch: ["유리공", "양초장인", "약사", "향 제조사", "양조사", "꿀술 양조사"], ar_painter: ["도공", "칠기 장인"],
    bu_builder: ["목각장인", "화재 진압대원", "조각가", "짐꾼", "가마꾼"],
    t_engineer: ["시계공", "물리학자", "건축가", "탑 건축가", "측량사", "운하 기술자"],
    tr_puppet: ["인형 장인", "꼭두각시 극단장", "허수아비 장인"], b_bard: ["악기 장인", "시인", "이야기꾼", "작곡가"],
    sc_scholar: ["종이 장인", "서기", "세리", "극작가", "소설가", "보험업자"], t_mech: ["마도구 장인"],
    w_berserker: ["정육점 주인", "사형집행인", "나무꾼", "거목 벌목꾼"], ga_fisher: ["횟감 장인"],
    mi_soldier: ["야전 취사병", "우편배달부", "전령"], hu_monster: ["몬스터 요리사", "마물학자"],
    h_inquisitor: ["판사", "변론가"], m_sage: ["재상", "대학자", "철학자", "은둔자"], d_reaper: ["장의사"],
    se_sailor: ["등대지기", "뱃사공"], fa_farmer: ["촌장", "정원사", "산나물 채집꾼"],
    r_trickster: ["탐정", "고리대금업자", "암시장 상인", "고고학자"], mi_general: ["왕"],
    tr_magician: ["투기꾼", "배우", "타로술사", "소믈리에", "바텐더"], cr_smith: ["무기상"], m_witch: ["마법 상점 주인", "마법 농부"],
    w_gladiator: ["용병 중개인"], tr_jester: ["가면 장인", "만담가", "경매사"], ci_guard: ["문지기", "점등원"], c_astro: ["천문학자", "꿈해몽가", "예언의 아이"], e_storm: ["기상학자"],
    n_flower: ["식물학자", "버섯재배사", "원예사", "약초 재배사", "조경가", "약초꾼", "버섯 채집꾼"],
    h_priest: ["신학자", "마음치유사", "순례자", "종지기", "성물 관리인"], d_necro: ["금서 연구가", "묘지기"],
    ga_miner: ["굴뚝청소부", "굴착꾼", "우물장이"], fa_herder: ["마부", "마구간지기", "수의사"],
    r_thief: ["구두닦이", "쥐잡이", "심부름꾼"], b_dancer: ["무용가", "탈춤꾼", "성악가"], o_miko: ["판소리꾼"],
    al_mad: ["독물학자"], h_nun: ["산파", "간호사", "유모", "요양사", "수녀"], o_taoist: ["침술사", "한의사", "풍수가", "심마니"],
    d_curse: ["역병 의사"], ma_monk: ["안마사", "수도사", "금욕 수행자"], e_water: ["온천 치료사", "수맥 탐지사"],
    g_bomber: ["철거공"], k_paladin: ["성지기"], sp_shaman: ["제사장", "풍년 기원사"], fa_bee: ["꿀 채집꾼"]
  };
  const lent = {};
  Object.entries(LEND).forEach(([id, names]) => names.forEach((n) => { lent[n] = id; }));

  const famFirst = {};
  ART.forEach(([id, fam]) => { if (!famFirst[fam]) famFirst[fam] = id; });

  /* 계열 안의 구체적인 낱말 → (생활 계열) 빌려 온 그림 → 계열의 기본 그림 */
  function heroArtId(job) {
    if (job._art) return job._art;
    const fam = F.FAMILY_LIST[job.fam];
    const own = ART.find(([, f, re]) => f === fam.id && re.source !== "." && re.test(job.base));
    const any = ART.find(([, f, re]) => f === fam.id && re.test(job.base));
    job._art = own ? own[0] : !fam.combat && lent[job.base] ? lent[job.base] : any ? any[0] : famFirst[fam.id];
    return job._art;
  }

  /* ── 겉모습 변형: 같은 그림을 쓰는 직업끼리도 달라 보이게 ──
     pal: 옷 색(주된 색을 h도로 돌리고 채도 s배, 밝기 v배), skin: 피부색, size: 키 배율, wide: 너비 배율,
     덧그림: wings(날개), halo(머리 고리), horns(뿔), ears(귀), crown(왕관),
     aura: 몸 주위 기운, clone: 쌍둥이·그림자 분신, ghost: 반투명, float: 떠 있음 */
  const PALS = [
    { h: 0 }, { h: 205 }, { h: 110 }, { h: 280 }, { h: 30 }, { h: 175 }, { h: 330 }, { h: 55, s: 0.9 }, { h: 235 }, { h: 140 },
    { h: 350, s: 0.8, v: 0.75 }, { h: 215, s: 0.45, v: 0.8 }, { h: 25, s: 0.5, v: 0.75 }, { h: 160, s: 0.5, v: 0.85 },
    { h: 300, s: 0.5, v: 1.05 }, { h: 45, s: 0.35, v: 1.1 }, { h: 260, s: 0.7, v: 0.65 }, { h: 85, s: 0.7 }
  ];
  const EL_PAL = {
    fire: { h: 8, s: 1.1 }, ice: { h: 195, v: 1.05 }, bolt: { h: 52, s: 1.05, v: 1.05 }, earth: { h: 30, s: 0.6, v: 0.85 },
    wind: { h: 160, s: 0.8, v: 1.05 }, light: { h: 46, s: 0.7, v: 1.12 }, dark: { h: 272, s: 0.8, v: 0.7 },
    nature: { h: 110 }, arcane: { h: 290 }
  };
  /* 수식어별 겉모습. 여기 없는 속성 수식어는 속성 색과 속성 기운을 쓴다 */
  const MOD_LOOK = {
    북방: { pal: { h: 205, s: 0.45, v: 1.08 } }, 설원: { pal: { h: 200, s: 0.4, v: 1.12 }, aura: "ice" },
    사막: { pal: { h: 38, s: 0.6, v: 1.05 } }, 동방: { pal: { h: 355 } }, 해안: { pal: { h: 195, v: 0.95 } }, 항구: { pal: { h: 220, v: 0.85 } },
    산악: { pal: { h: 25, s: 0.5, v: 0.8 } }, 변경: { pal: { h: 90, s: 0.35, v: 0.8 } }, 용병: { pal: { h: 20, s: 0.4, v: 0.75 } },
    군단: { pal: { h: 0, s: 0.9, v: 0.75 } }, 정글: { pal: { h: 120, v: 0.85 } }, 늪지: { pal: { h: 95, s: 0.5, v: 0.7 } },
    초원: { pal: { h: 85 } }, 지하도시: { pal: { h: 260, s: 0.5, v: 0.7 } }, 천공섬: { pal: { h: 195, s: 0.6, v: 1.1 }, aura: "wind" },
    황야: { pal: { h: 25, s: 0.45, v: 0.9 } }, 왕도: { pal: { h: 250 } }, 빈민가: { pal: { h: 30, s: 0.25, v: 0.8 } },
    수도원: { pal: { h: 40, s: 0.3, v: 1.1 } },
    엘프: { pal: { h: 120, s: 0.8 }, hair: "blonde", wide: 0.94, size: 1.03, ears: "elf" },
    다크엘프: { pal: { h: 270, s: 0.6, v: 0.7 }, skin: "dark", hair: "white", wide: 0.94, ears: "elf" },
    드워프: { pal: { h: 25, s: 0.7, v: 0.85 }, hair: "orange", size: 0.84, wide: 1.16 },
    오크: { pal: { h: 20, s: 0.5, v: 0.75 }, skin: "orc", size: 1.06, wide: 1.08, horns: "tusk" },
    하플링: { pal: { h: 90, s: 0.7 }, size: 0.8 },
    수인: { pal: { h: 30, s: 0.6, v: 0.85 }, ears: "wolf" },
    용인: { skin: "lizard", horns: "dragon" },
    거인족: { pal: { h: 15, s: 0.4, v: 0.8 }, size: 1.24, wide: 1.06 },
    요정: { size: 0.8, wings: "fairy", float: true, aura: "dream" },
    언데드: { pal: { h: 100, s: 0.3, v: 0.7 }, skin: "undead", hair: "white", aura: "dark" },
    리자드맨: { pal: { h: 150, s: 0.6, v: 0.8 }, skin: "lizard", wide: 1.05 },
    노움: { pal: { h: 0, s: 0.8 }, size: 0.8, wide: 1.06 },
    고블린: { pal: { h: 60, s: 0.5, v: 0.75 }, skin: "goblin", size: 0.84, ears: "elf" },
    켄타우로스: { pal: { h: 35, s: 0.6 }, size: 1.1 },
    인어족: { aura: "bubble" },
    트롤: { pal: { h: 30, s: 0.4, v: 0.7 }, skin: "troll", size: 1.16, wide: 1.1 },
    고양이족: { pal: { h: 320, s: 0.7 }, ears: "cat" },
    천사혈통: { hair: "blonde", wings: "angel", halo: true },
    악마혈통: { skin: "demon", horns: "demon", wings: "bat" },
    방랑: { pal: { h: 80, s: 0.3, v: 0.85 } }, 떠돌이: { pal: { h: 35, s: 0.35, v: 0.85 } },
    왕실: { pal: { h: 245, v: 0.9 }, crown: true }, 귀족: { pal: { h: 330, s: 0.8 } }, 궁정: { pal: { h: 265, s: 0.7 }, crown: true },
    은둔: { pal: { h: 140, s: 0.35, v: 0.85 } }, 해적: { pal: { h: 0, s: 0.8, v: 0.7 } },
    타락한: { pal: { h: 280, s: 0.6, v: 0.6 }, aura: "dark", horns: "demon" },
    신성한: { pal: { h: 46, s: 0.5, v: 1.15 }, aura: "light", halo: true },
    저주받은: { pal: { h: 290, s: 0.5, v: 0.65 }, aura: "void" },
    광기의: { pal: { h: 350, s: 1.2 }, aura: "rage" },
    기계: { pal: { h: 210, s: 0.2, v: 0.9 }, aura: "bolt" }, 증기: { pal: { h: 25, s: 0.75, v: 0.8 }, aura: "steam" },
    유령: { pal: { h: 200, s: 0.4 }, hair: "silver", ghost: true, float: true, aura: "spirit" },
    황금: { pal: { h: 45, s: 1.15, v: 1.1 }, aura: "gold" },
    서커스: { pal: { h: 320, s: 1.1 } }, 시골: { pal: { h: 75, s: 0.6 } }, 길드: { pal: { h: 180 } },
    거장: { pal: { h: 40, s: 0.9 }, aura: "gold", crown: true },
    혁명: { pal: { h: 0, s: 1.1, v: 0.9 } }, 망국: { pal: { h: 220, s: 0.25, v: 0.75 }, aura: "steam" },
    몽환: { pal: { h: 300, s: 0.55, v: 1.1 }, aura: "dream", float: true },
    쌍둥이: { clone: "twin" }, 그림자: { pal: { h: 265, s: 0.5, v: 0.55 }, clone: "shadow" },
    맹인: { pal: { h: 220, s: 0.3, v: 0.9 } }, 백전노장: { pal: { h: 20, s: 0.45, v: 0.8 }, size: 1.04 },
    신동: { size: 0.84 }, 핏빛: { pal: { h: 355, s: 1.1, v: 0.7 }, aura: "blood" },
    별빛: { pal: { h: 230, v: 0.85 }, aura: "star" }, 월광: { pal: { h: 220, s: 0.4, v: 1.1 }, aura: "star" },
    영혼: { aura: "spirit" }, 수정: { aura: "arcane" }, 안개: { aura: "steam" },
    용혈: { pal: { h: 5, s: 1.1, v: 0.85 }, wings: "dragon", horns: "dragon", aura: "fire" },
    천상: { pal: { h: 48, s: 0.5, v: 1.15 }, wings: "angel", halo: true, aura: "light" },
    공허: { pal: { h: 265, s: 0.7, v: 0.5 }, aura: "void" },
    시공: { pal: { h: 185 }, aura: "time" }, 혼돈: { aura: "chaos" },
    세계수: { pal: { h: 115 }, aura: "leaf" }, 불사조: { pal: { h: 22, s: 1.15 }, wings: "phoenix", aura: "fire" },
    운명: { pal: { h: 45, s: 1.1 }, aura: "star" }, 신격: { pal: { h: 48, s: 0.6, v: 1.15 }, halo: true, aura: "gold" },
    태초: { pal: { h: 200, s: 0.15, v: 1.2 }, aura: "light" },
    종말: { pal: { h: 355, s: 0.9, v: 0.55 }, horns: "demon", aura: "void" },
    성좌: { pal: { h: 230, v: 0.8 }, aura: "star", halo: true },
    마왕: { pal: { h: 285, s: 0.8, v: 0.5 }, horns: "demon", wings: "bat", aura: "dark" },
    정령왕: { pal: { h: 170, v: 1.05 }, aura: "spirit", float: true }
  };

  const HAIR_LIST = [null, "black", "blonde", "white", "red", "blue", "pink", "silver", "green", "purple", "orange", "brown", "teal", null];
  /* ── 머리 바꿔 달기 ──
     그림마다 머리(얼굴·머리카락·모자)를 떼어 다른 그림의 몸에 붙여 새 인물을 만든다.
     f 여성형, m 남성형, n 중성, x 복면·두건, h 투구, b 짐승 머리. 머리를 떼기 어려운 그림(날개·용·책이 머리에
     붙어 있거나 얼굴이 가려진 그림)은 목록에 없다 */
  /* 그림마다 직접 잰 얼굴 위치 [얼굴 가운데 x, 턱 y, 얼굴 폭] (원래 그림 픽셀). 머리를 떼고 붙이는 기준 */
  const HEAD_AT = {
    a_elf: [78, 59, 29], a_hunter: [84, 74, 30], al_alch: [87, 78, 30], al_mad: [96, 76, 40], ar_painter: [105, 82, 36],
    b_bard: [73, 60, 30], b_dancer: [118, 64, 28], bl_dragon: [113, 58, 40], bl_fox: [98, 62, 26], bl_mermaid: [104, 49, 25],
    bl_vamp: [99, 55, 24], bl_wolf: [92, 58, 40], bu_builder: [87, 68, 34], c_astro: [96, 76, 28], c_time: [95, 70, 30],
    c_void: [103, 65, 32], ci_guard: [82, 71, 34], co_merchant: [77, 74, 30], cr_smith: [54, 61, 30], cu_chef: [97, 75, 34],
    d_curse: [102, 64, 36], d_necro: [102, 60, 30], d_reaper: [104, 64, 30], e_earth: [77, 76, 28], e_fire: [107, 76, 30],
    e_ice: [96, 72, 32], e_storm: [79, 80, 26], e_water: [102, 56, 30], fa_bee: [46, 58, 32], fa_farmer: [87, 62, 36],
    fa_herder: [56, 62, 30], g_bomber: [52, 66, 30], g_slinger: [57, 62, 30], ga_fisher: [58, 62, 34], ga_miner: [50, 64, 32],
    h_inquisitor: [102, 58, 26], h_nun: [85, 58, 26], h_priest: [97, 70, 30], hu_hunter: [90, 64, 30], hu_monster: [69, 66, 30],
    hu_slayer: [86, 64, 30], k_dark: [99, 66, 30], k_lancer: [110, 72, 26], k_paladin: [81, 56, 26], k_rose: [85, 68, 28],
    m_rune: [80, 68, 28], m_witch: [122, 72, 26], m_wizard: [65, 74, 26], ma_boxer: [65, 56, 26], ma_girl: [84, 56, 26],
    ma_monk: [68, 52, 28], me_doctor: [85, 66, 30], mi_general: [93, 62, 28], mi_soldier: [90, 70, 32], my_fortune: [52, 76, 32],
    n_beast: [85, 72, 28], n_flower: [98, 78, 28], o_miko: [96, 64, 30], o_samurai: [100, 64, 28], o_taoist: [68, 74, 28],
    o_warrior: [106, 62, 26], r_thief: [94, 68, 32], r_trickster: [88, 68, 32], s_kunoichi: [109, 70, 26], s_ninja: [80, 62, 34],
    s_shadow: [113, 64, 32], sc_scholar: [67, 74, 34], se_pirate: [60, 68, 34], se_sailor: [91, 60, 34], sp_medium: [98, 62, 28],
    sp_shaman: [54, 78, 28], su_summoner: [100, 60, 28], sv_maid: [52, 68, 32], t_engineer: [87, 76, 26], tr_acrobat: [81, 57, 26],
    tr_jester: [61, 70, 34], tr_magician: [110, 77, 30], w_berserker: [72, 61, 32], w_gladiator: [71, 80, 28], w_spear: [100, 76, 34],
    w_sword: [110, 74, 34], w_twin: [100, 65, 30]
  };
  const HEAD_TAG = {
    a_elf: "f", b_dancer: "f", bl_fox: "f", bl_mermaid: "f", c_void: "f", e_ice: "f", e_water: "f", k_rose: "f", m_witch: "f",
    ma_girl: "f", my_fortune: "f", n_flower: "f", o_miko: "f", s_kunoichi: "f", sv_maid: "f", tr_acrobat: "f",
    h_nun: "f", sp_medium: "f", w_twin: "f", o_warrior: "f", se_sailor: "m", su_summoner: "n",
    b_bard: "m", bl_vamp: "m", bu_builder: "m", ci_guard: "m", co_merchant: "m", cr_smith: "m", cu_chef: "m",
    fa_farmer: "m", fa_herder: "m", g_bomber: "m", g_slinger: "m", ga_fisher: "m", ga_miner: "m", h_priest: "m", hu_hunter: "m",
    hu_monster: "m", k_paladin: "m", ma_boxer: "m", ma_monk: "m", mi_general: "m", o_samurai: "m", o_taoist: "m", r_trickster: "m",
    sc_scholar: "m", se_pirate: "m", sp_shaman: "m", w_berserker: "m", w_spear: "m", w_sword: "m", fa_bee: "m",
    al_alch: "n", ar_painter: "n", c_astro: "n", e_storm: "n", m_rune: "n", m_wizard: "n", t_engineer: "n", tr_jester: "n",
    tr_magician: "n", e_earth: "n", me_doctor: "n",
    a_hunter: "x", r_thief: "x", s_ninja: "x", d_curse: "x", al_mad: "x", s_shadow: "x", d_necro: "x", d_reaper: "x",
    hu_slayer: "h", k_dark: "h", k_lancer: "h", mi_soldier: "h", w_gladiator: "h", h_inquisitor: "h",
    bl_dragon: "b", bl_wolf: "b", n_beast: "b"
  };
  /* 머리를 받을 수 있는 몸: 받을 수 있는 머리 종류 */
  const BODY_TAKES = {};
  const takes = (ids, kinds) => ids.split(" ").forEach((id) => { BODY_TAKES[id] = kinds; });
  takes("a_elf b_dancer bl_fox bl_mermaid c_void e_fire e_ice e_water k_rose m_witch ma_girl my_fortune n_flower o_miko sv_maid tr_acrobat h_nun sp_medium w_twin o_warrior", "fn");
  takes("s_kunoichi", "fnx");
  takes("b_bard bu_builder ci_guard co_merchant cr_smith cu_chef fa_farmer fa_herder g_bomber g_slinger ga_fisher ga_miner h_priest hu_hunter ma_boxer ma_monk mi_general o_samurai o_taoist sc_scholar se_pirate sp_shaman w_sword fa_bee se_sailor", "mn");
  takes("bl_vamp hu_monster r_trickster", "mnx");
  takes("k_paladin w_spear w_berserker", "mnh");
  takes("al_alch ar_painter c_astro e_storm m_rune m_wizard t_engineer tr_jester tr_magician e_earth me_doctor su_summoner", "fmn");
  takes("a_hunter r_thief s_ninja d_curse al_mad s_shadow d_necro d_reaper", "fmnx");
  takes("hu_slayer k_dark k_lancer mi_soldier w_gladiator h_inquisitor", "mnh");
  const HEADS_BY = {};
  Object.entries(HEAD_TAG).forEach(([id, t]) => { (HEADS_BY[t] = HEADS_BY[t] || []).push(id); });
  /* 이름에 성별이 드러나는 직업 */
  const FEMALE = /(녀|희|어머니|아가씨)$/;
  const MALE = /(사나이|신부|교황|승|왕|장군|영감)$/;

  function pickHead(job, body, mod, combat) {
    const beast = mod === "수인" ? (BODY_TAKES[body] === "fn" ? ["bl_fox"] : ["bl_wolf", "n_beast"]) : mod === "용인" || mod === "리자드맨" ? ["bl_dragon"] : null;
    if (beast) return beast.includes(body) ? null : beast[fnv(job.name + "^") % beast.length];
    const kinds = BODY_TAKES[body];
    if (!kinds) return null;
    let allow = kinds;
    if (FEMALE.test(job.base)) allow = "f";
    else if (MALE.test(job.base)) allow = "m";
    if (!combat) allow = allow.replace(/[xh]/g, "");
    const pool = [];
    allow.split("").forEach((k) => (HEADS_BY[k] || []).forEach((id) => { if (id !== body) pool.push(id); }));
    if (!pool.length) return null;
    /* 열에 하나 남짓은 원래 머리 그대로 */
    const r = fnv(job.name + "^");
    if (r % 7 === 0) return null;
    return pool[r % pool.length];
  }

  function fnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* 같은 그림을 쓰는 기본 직업들에 차례로 다른 옷 색을 준다(첫 직업은 원래 색) */
  let baseOrder = null;
  function baseIndex(job) {
    if (!baseOrder) {
      baseOrder = {};
      F.JOBS.forEach((j) => {
        const list = (baseOrder[heroArtId(j)] = baseOrder[heroArtId(j)] || []);
        if (!list.includes(j.base)) list.push(j.base);
      });
    }
    return Math.max(0, baseOrder[heroArtId(job)].indexOf(job.base));
  }

  function lookOf(job) {
    if (job._look) return job._look;
    const mod = job.mod ? F.MODS[job.mod] : null;
    const ml = (mod && MOD_LOOK[mod.name]) || {};
    const el = mod ? mod.el : job.el;
    const i = baseIndex(job);
    let pal = ml.pal || null;
    if (!pal && el && EL_PAL[el] && (mod || i > 0)) {
      /* 속성이 같은 직업끼리도 색이 조금씩 다르게 */
      const p = EL_PAL[el];
      pal = { h: p.h + ((fnv(job.name) % 5) - 2) * 9, s: p.s, v: p.v };
    }
    if (!pal && (mod || i > 0)) pal = PALS[(mod ? fnv(mod.name) : i - 1) % PALS.length];
    const lk = Object.assign({ size: 1, wide: 1 }, ml, { pal });
    /* 그림마다 첫 기본 직업은 원래 인물, 나머지는 다른 그림의 머리를 단다 */
    if (mod || i > 0) lk.head = pickHead(job, heroArtId(job), mod ? mod.name : null, F.FAMILY_LIST[job.fam].combat);
    if (lk.head && HEAD_TAG[lk.head] === "b") { delete lk.ears; delete lk.horns; delete lk.skin; }
    if (!lk.aura && mod && mod.el && mod.el !== "phys" && mod.tier >= 1) lk.aura = mod.el;
    /* 머리카락 색: 그림마다 첫 기본 직업은 원래 색, 나머지는 이름으로 고른다(원래 색도 섞인다) */
    if (!lk.hair && (mod || i > 0)) lk.hair = HAIR_LIST[fnv(job.name + "@") % HAIR_LIST.length];
    lk.size *= 1 + ((fnv(job.name + "#") % 7) - 3) * 0.012;
    lk.rarity = job.rarity;
    job._look = lk;
    return lk;
  }

  F.heroes = { ART, heroArtId, styleOf, lookOf, HEAD_AT, HEAD_TAG, BODY_TAKES };
})(typeof window !== "undefined" ? window : globalThis);
