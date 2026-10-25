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

  const famFirst = {};
  ART.forEach(([id, fam]) => { if (!famFirst[fam]) famFirst[fam] = id; });

  function heroArtId(job) {
    if (job._art) return job._art;
    const fam = F.FAMILY_LIST[job.fam].id;
    const hit = ART.find(([, f, re]) => f === fam && re.test(job.base));
    job._art = hit ? hit[0] : famFirst[fam];
    return job._art;
  }

  F.heroes = { ART, heroArtId, styleOf };
})(typeof window !== "undefined" ? window : globalThis);
