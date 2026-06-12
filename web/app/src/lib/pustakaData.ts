// Static reference data for Pustaka — 99 Asmaul Husna + 29 Karakter Luhur LDII.
// 99 Asmaul Husna sourced from canonical Tirmidhi narration (the version used
// in mainstream Indonesian Islamic curricula). 29 Karakter Luhur LDII per
// PPG curriculum (some sub-groupings vary between editions; see comments).

export interface AsmaulName {
  no: number;
  arab: string;
  latin: string;
  arti: string;
  artiEn: string;
}

export const ASMAUL_HUSNA: AsmaulName[] = [
  { no: 1,  arab: 'الرَّحْمَنُ',      latin: 'Ar-Rahman',       arti: 'Yang Maha Pengasih',                 artiEn: 'The Most Compassionate' },
  { no: 2,  arab: 'الرَّحِيمُ',       latin: 'Ar-Rahim',        arti: 'Yang Maha Penyayang',                artiEn: 'The Most Merciful' },
  { no: 3,  arab: 'الْمَلِكُ',        latin: 'Al-Malik',        arti: 'Yang Maha Merajai',                  artiEn: 'The King / Sovereign' },
  { no: 4,  arab: 'الْقُدُّوسُ',      latin: 'Al-Quddus',       arti: 'Yang Maha Suci',                     artiEn: 'The Most Holy' },
  { no: 5,  arab: 'السَّلاَمُ',       latin: 'As-Salam',        arti: 'Yang Maha Memberi Kesejahteraan',    artiEn: 'The Source of Peace' },
  { no: 6,  arab: 'الْمُؤْمِنُ',      latin: "Al-Mu'min",       arti: 'Yang Maha Memberi Keamanan',         artiEn: 'The Granter of Security' },
  { no: 7,  arab: 'الْمُهَيْمِنُ',    latin: 'Al-Muhaymin',     arti: 'Yang Maha Memelihara',               artiEn: 'The Guardian' },
  { no: 8,  arab: 'الْعَزِيزُ',       latin: 'Al-Aziz',         arti: 'Yang Maha Gagah',                    artiEn: 'The Almighty' },
  { no: 9,  arab: 'الْجَبَّارُ',      latin: 'Al-Jabbar',       arti: 'Yang Maha Perkasa',                  artiEn: 'The Compeller' },
  { no: 10, arab: 'الْمُتَكَبِّرُ',   latin: 'Al-Mutakabbir',   arti: 'Yang Maha Megah',                    artiEn: 'The Supreme' },
  { no: 11, arab: 'الْخَالِقُ',       latin: 'Al-Khaliq',       arti: 'Yang Maha Pencipta',                 artiEn: 'The Creator' },
  { no: 12, arab: 'الْبَارِئُ',       latin: "Al-Bari'",        arti: 'Yang Maha Mengadakan',               artiEn: 'The Evolver / Maker' },
  { no: 13, arab: 'الْمُصَوِّرُ',     latin: 'Al-Mushawwir',    arti: 'Yang Maha Membentuk Rupa',           artiEn: 'The Fashioner' },
  { no: 14, arab: 'الْغَفَّارُ',      latin: 'Al-Ghaffar',      arti: 'Yang Maha Pengampun',                artiEn: 'The Ever-Forgiving' },
  { no: 15, arab: 'الْقَهَّارُ',      latin: 'Al-Qahhar',       arti: 'Yang Maha Memaksa',                  artiEn: 'The Subduer' },
  { no: 16, arab: 'الْوَهَّابُ',      latin: 'Al-Wahhab',       arti: 'Yang Maha Pemberi Karunia',          artiEn: 'The Bestower' },
  { no: 17, arab: 'الرَّزَّاقُ',      latin: 'Ar-Razzaq',       arti: 'Yang Maha Pemberi Rezeki',           artiEn: 'The Provider' },
  { no: 18, arab: 'الْفَتَّاحُ',      latin: 'Al-Fattah',       arti: 'Yang Maha Pembuka Rahmat',           artiEn: 'The Opener' },
  { no: 19, arab: 'اَلْعَلِيْمُ',     latin: "Al-'Alim",        arti: 'Yang Maha Mengetahui',               artiEn: 'The All-Knowing' },
  { no: 20, arab: 'الْقَابِضُ',       latin: 'Al-Qabidh',       arti: 'Yang Maha Menyempitkan',             artiEn: 'The Withholder' },
  { no: 21, arab: 'الْبَاسِطُ',       latin: 'Al-Basith',       arti: 'Yang Maha Melapangkan',              artiEn: 'The Expander' },
  { no: 22, arab: 'الْخَافِضُ',       latin: 'Al-Khafidh',      arti: 'Yang Maha Merendahkan',              artiEn: 'The Abaser' },
  { no: 23, arab: 'الرَّافِعُ',       latin: "Ar-Rafi'",        arti: 'Yang Maha Meninggikan',              artiEn: 'The Exalter' },
  { no: 24, arab: 'الْمُعِزُّ',       latin: "Al-Mu'izz",       arti: 'Yang Maha Memuliakan',               artiEn: 'The Giver of Honor' },
  { no: 25, arab: 'الْمُذِلُّ',       latin: 'Al-Mudzill',      arti: 'Yang Maha Menghinakan',              artiEn: 'The Giver of Dishonor' },
  { no: 26, arab: 'السَّمِيعُ',       latin: "As-Sami'",        arti: 'Yang Maha Mendengar',                artiEn: 'The All-Hearing' },
  { no: 27, arab: 'الْبَصِيرُ',       latin: 'Al-Bashir',       arti: 'Yang Maha Melihat',                  artiEn: 'The All-Seeing' },
  { no: 28, arab: 'الْحَكَمُ',        latin: 'Al-Hakam',        arti: 'Yang Maha Menetapkan',               artiEn: 'The Judge' },
  { no: 29, arab: 'الْعَدْلُ',        latin: "Al-'Adl",         arti: 'Yang Maha Adil',                     artiEn: 'The Just' },
  { no: 30, arab: 'اللَّطِيفُ',       latin: 'Al-Lathif',       arti: 'Yang Maha Lembut',                   artiEn: 'The Most Subtle' },
  { no: 31, arab: 'الْخَبِيرُ',       latin: 'Al-Khabir',       arti: 'Yang Maha Mengenal',                 artiEn: 'The All-Aware' },
  { no: 32, arab: 'الْحَلِيمُ',       latin: 'Al-Halim',        arti: 'Yang Maha Penyantun',                artiEn: 'The Forbearing' },
  { no: 33, arab: 'الْعَظِيمُ',       latin: "Al-'Azhim",       arti: 'Yang Maha Agung',                    artiEn: 'The Magnificent' },
  { no: 34, arab: 'الْغَفُورُ',       latin: 'Al-Ghafur',       arti: 'Yang Maha Pengampun',                artiEn: 'The Forgiving' },
  { no: 35, arab: 'الشَّكُورُ',       latin: 'Asy-Syakur',      arti: 'Yang Maha Pembalas Budi',            artiEn: 'The Most Appreciative' },
  { no: 36, arab: 'الْعَلِيُّ',       latin: "Al-'Aliyy",       arti: 'Yang Maha Tinggi',                   artiEn: 'The Most High' },
  { no: 37, arab: 'الْكَبِيرُ',       latin: 'Al-Kabir',        arti: 'Yang Maha Besar',                    artiEn: 'The Most Great' },
  { no: 38, arab: 'الْحَفِيظُ',       latin: 'Al-Hafizh',       arti: 'Yang Maha Memelihara',               artiEn: 'The Preserver' },
  { no: 39, arab: 'الْمُقيِتُ',       latin: 'Al-Muqit',        arti: 'Yang Maha Pemberi Kecukupan',        artiEn: 'The Sustainer' },
  { no: 40, arab: 'الْحسِيبُ',        latin: 'Al-Hasib',        arti: 'Yang Maha Membuat Perhitungan',      artiEn: 'The Reckoner' },
  { no: 41, arab: 'الْجَلِيلُ',       latin: 'Al-Jalil',        arti: 'Yang Maha Luhur',                    artiEn: 'The Majestic' },
  { no: 42, arab: 'الْكَرِيمُ',       latin: 'Al-Karim',        arti: 'Yang Maha Pemurah',                  artiEn: 'The Most Generous' },
  { no: 43, arab: 'الرَّقِيبُ',       latin: 'Ar-Raqib',        arti: 'Yang Maha Mengawasi',                artiEn: 'The Watchful' },
  { no: 44, arab: 'الْمُجِيبُ',       latin: 'Al-Mujib',        arti: 'Yang Maha Mengabulkan',              artiEn: 'The Responsive' },
  { no: 45, arab: 'الْوَاسِعُ',       latin: "Al-Wasi'",        arti: 'Yang Maha Luas',                     artiEn: 'The All-Encompassing' },
  { no: 46, arab: 'الْحَكِيمُ',       latin: 'Al-Hakim',        arti: 'Yang Maha Bijaksana',                artiEn: 'The Most Wise' },
  { no: 47, arab: 'الْوَدُودُ',       latin: 'Al-Wadud',        arti: 'Yang Maha Mengasihi',                artiEn: 'The Most Loving' },
  { no: 48, arab: 'الْمَجِيدُ',       latin: 'Al-Majid',        arti: 'Yang Maha Mulia',                    artiEn: 'The Glorious' },
  { no: 49, arab: 'الْبَاعِثُ',       latin: "Al-Ba'its",       arti: 'Yang Maha Membangkitkan',            artiEn: 'The Resurrector' },
  { no: 50, arab: 'الشَّهِيدُ',       latin: 'Asy-Syahid',      arti: 'Yang Maha Menyaksikan',              artiEn: 'The Witness' },
  { no: 51, arab: 'الْحَقُّ',         latin: 'Al-Haqq',         arti: 'Yang Maha Benar',                    artiEn: 'The Truth' },
  { no: 52, arab: 'الْوَكِيلُ',       latin: 'Al-Wakil',        arti: 'Yang Maha Memelihara',               artiEn: 'The Trustee' },
  { no: 53, arab: 'الْقَوِيُّ',       latin: 'Al-Qawiyy',       arti: 'Yang Maha Kuat',                     artiEn: 'The Most Strong' },
  { no: 54, arab: 'الْمَتِينُ',       latin: 'Al-Matin',        arti: 'Yang Maha Kokoh',                    artiEn: 'The Firm' },
  { no: 55, arab: 'الْوَلِيُّ',       latin: 'Al-Waliyy',       arti: 'Yang Maha Melindungi',               artiEn: 'The Protecting Friend' },
  { no: 56, arab: 'الْحَمِيدُ',       latin: 'Al-Hamid',        arti: 'Yang Maha Terpuji',                  artiEn: 'The Praiseworthy' },
  { no: 57, arab: 'الْمُحْصِي',       latin: 'Al-Muhshi',       arti: 'Yang Maha Mengkalkulasi',            artiEn: 'The Accounter' },
  { no: 58, arab: 'الْمُبْدِئُ',      latin: "Al-Mubdi'",       arti: 'Yang Maha Memulai',                  artiEn: 'The Originator' },
  { no: 59, arab: 'الْمُعِيدُ',       latin: "Al-Mu'id",        arti: 'Yang Maha Mengembalikan',            artiEn: 'The Restorer' },
  { no: 60, arab: 'الْمُحْيِي',       latin: 'Al-Muhyi',        arti: 'Yang Maha Menghidupkan',             artiEn: 'The Giver of Life' },
  { no: 61, arab: 'اَلْمُمِيتُ',      latin: 'Al-Mumit',        arti: 'Yang Maha Mematikan',                artiEn: 'The Bringer of Death' },
  { no: 62, arab: 'الْحَيُّ',         latin: 'Al-Hayy',         arti: 'Yang Maha Hidup',                    artiEn: 'The Ever-Living' },
  { no: 63, arab: 'الْقَيُّومُ',      latin: 'Al-Qayyum',       arti: 'Yang Maha Mandiri',                  artiEn: 'The Self-Subsisting' },
  { no: 64, arab: 'الْوَاجِدُ',       latin: 'Al-Wajid',        arti: 'Yang Maha Penemu',                   artiEn: 'The Perceiver' },
  { no: 65, arab: 'الْمَاجِدُ',       latin: 'Al-Majid',        arti: 'Yang Maha Mulia',                    artiEn: 'The Illustrious' },
  { no: 66, arab: 'الْواحِدُ',        latin: 'Al-Wahid',        arti: 'Yang Maha Tunggal',                  artiEn: 'The One' },
  { no: 67, arab: 'اَلْأَحَدُ',       latin: 'Al-Ahad',         arti: 'Yang Maha Esa',                      artiEn: 'The Unique' },
  { no: 68, arab: 'الصَّمَدُ',        latin: 'As-Shamad',       arti: 'Yang Maha Dibutuhkan',               artiEn: 'The Eternal Refuge' },
  { no: 69, arab: 'الْقَادِرُ',       latin: 'Al-Qadir',        arti: 'Yang Maha Menentukan',               artiEn: 'The Capable' },
  { no: 70, arab: 'الْمُقْتَدِرُ',    latin: 'Al-Muqtadir',     arti: 'Yang Maha Berkuasa',                 artiEn: 'The Powerful' },
  { no: 71, arab: 'الْمُقَدِّمُ',     latin: 'Al-Muqaddim',     arti: 'Yang Maha Mendahulukan',             artiEn: 'The Expediter' },
  { no: 72, arab: 'الْمُؤَخِّرُ',     latin: "Al-Mu'akhkhir",   arti: 'Yang Maha Mengakhirkan',             artiEn: 'The Delayer' },
  { no: 73, arab: 'الأوَّلُ',         latin: 'Al-Awwal',        arti: 'Yang Maha Awal',                     artiEn: 'The First' },
  { no: 74, arab: 'الآخِرُ',          latin: 'Al-Akhir',        arti: 'Yang Maha Akhir',                    artiEn: 'The Last' },
  { no: 75, arab: 'الظَّاهِرُ',       latin: 'Azh-Zhahir',      arti: 'Yang Maha Nyata',                    artiEn: 'The Manifest' },
  { no: 76, arab: 'الْبَاطِنُ',       latin: 'Al-Bathin',       arti: 'Yang Maha Ghaib',                    artiEn: 'The Hidden' },
  { no: 77, arab: 'الْوَالِيُّ',      latin: 'Al-Wali',         arti: 'Yang Maha Memerintah',               artiEn: 'The Governor' },
  { no: 78, arab: 'الْمُتَعَالِي',    latin: "Al-Muta'ali",     arti: 'Yang Maha Tinggi',                   artiEn: 'The Self-Exalted' },
  { no: 79, arab: 'الْبَرُّ',         latin: 'Al-Barr',         arti: 'Yang Maha Penderma',                 artiEn: 'The Source of Goodness' },
  { no: 80, arab: 'التَّوَابُ',       latin: 'At-Tawwab',       arti: 'Yang Maha Penerima Tobat',           artiEn: 'The Acceptor of Repentance' },
  { no: 81, arab: 'الْمُنْتَقِمُ',    latin: 'Al-Muntaqim',     arti: 'Yang Maha Pemberi Balasan',          artiEn: 'The Avenger' },
  { no: 82, arab: 'العَفُوُّ',        latin: "Al-'Afuww",       arti: 'Yang Maha Pemaaf',                   artiEn: 'The Pardoner' },
  { no: 83, arab: 'الرَّؤُوفُ',       latin: "Ar-Ra'uf",        arti: 'Yang Maha Pengasuh',                 artiEn: 'The Most Kind' },
  { no: 84, arab: 'مَالِكُ الْمُلْكِ', latin: 'Malikul-Mulk',   arti: 'Yang Maha Penguasa Kerajaan',        artiEn: 'Owner of All Sovereignty' },
  { no: 85, arab: 'ذُوالْجَلاَلِ وَالإكْرَامِ', latin: 'Dzul-Jalali wal-Ikram', arti: 'Yang Maha Pemilik Kebesaran dan Kemuliaan', artiEn: 'Lord of Majesty and Honor' },
  { no: 86, arab: 'الْمُقْسِطُ',      latin: 'Al-Muqsith',      arti: 'Yang Maha Pemberi Keadilan',         artiEn: 'The Equitable' },
  { no: 87, arab: 'الْجَامِعُ',       latin: "Al-Jami'",        arti: 'Yang Maha Mengumpulkan',             artiEn: 'The Gatherer' },
  { no: 88, arab: 'الْغَنِيُّ',       latin: 'Al-Ghaniyy',      arti: 'Yang Maha Kaya',                     artiEn: 'The Self-Sufficient' },
  { no: 89, arab: 'الْمُغْنِي',       latin: 'Al-Mughni',       arti: 'Yang Maha Pemberi Kekayaan',         artiEn: 'The Enricher' },
  { no: 90, arab: 'اَلْمَانِعُ',      latin: "Al-Mani'",        arti: 'Yang Maha Mencegah',                 artiEn: 'The Preventer' },
  { no: 91, arab: 'الضَّارَّ',        latin: 'Adh-Dharr',       arti: 'Yang Maha Penimpa Kemudaratan',      artiEn: 'The Distresser' },
  { no: 92, arab: 'النَّافِعُ',       latin: "An-Nafi'",        arti: 'Yang Maha Memberi Manfaat',          artiEn: 'The Propitious' },
  { no: 93, arab: 'النُّورُ',         latin: 'An-Nur',          arti: 'Yang Maha Bercahaya',                artiEn: 'The Light' },
  { no: 94, arab: 'الْهَادِي',        latin: 'Al-Hadi',         arti: 'Yang Maha Pemberi Petunjuk',         artiEn: 'The Guide' },
  { no: 95, arab: 'الْبَدِيعُ',       latin: "Al-Badi'",        arti: 'Yang Maha Pencipta Tiada Bandingan', artiEn: 'The Incomparable' },
  { no: 96, arab: 'الْبَاقِي',        latin: 'Al-Baqi',         arti: 'Yang Maha Kekal',                    artiEn: 'The Everlasting' },
  { no: 97, arab: 'الْوَارِثُ',       latin: 'Al-Warits',       arti: 'Yang Maha Pewaris',                  artiEn: 'The Inheritor' },
  { no: 98, arab: 'الرَّشِيدُ',       latin: 'Ar-Rasyid',       arti: 'Yang Maha Pandai',                   artiEn: 'The Guide to the Right Path' },
  { no: 99, arab: 'الصَّبُورُ',       latin: 'As-Shabur',       arti: 'Yang Maha Sabar',                    artiEn: 'The Most Patient' },
];

// 29 Karakter Luhur LDII — totals to 29 across 6 parent groups. Some sub-
// groupings vary across PPG editions; sumber utama: pondok PPG / DPP LDII
// curriculum. Verify nama parent di handbook lokal untuk grup #3-#6.
export interface KarakterGroup {
  parent: string;
  parentEn: string;
  items: { id: string; en: string }[];
}

export const KARAKTER_LUHUR: KarakterGroup[] = [
  {
    parent: '4 Tali Keimanan',
    parentEn: '4 Pillars of Faith',
    items: [
      { id: 'Bersyukur',    en: 'Gratitude' },
      { id: 'Mempersungguh', en: 'Earnestness' },
      { id: 'Berdoa',       en: 'Supplication' },
      { id: 'Mengagungkan', en: 'Glorification' },
    ],
  },
  {
    parent: '6 Tabi\'at Luhur',
    parentEn: '6 Noble Traits',
    items: [
      { id: 'Rukun',                en: 'Harmony' },
      { id: 'Kompak',               en: 'Solidarity' },
      { id: 'Kerjasama yang Baik',  en: 'Good Cooperation' },
      { id: 'Jujur',                en: 'Honesty' },
      { id: 'Amanah',               en: 'Trustworthiness' },
      { id: 'Mujhid Muzhid',        en: 'Diligent & Frugal' },
    ],
  },
  {
    parent: '5 Bisa (Karakter Sukses)',
    parentEn: '5 Capabilities of Success',
    items: [
      { id: 'Bisa Mengaji',                  en: 'Can recite Qur\'an' },
      { id: 'Bisa Mengamalkan',              en: 'Can practice the teachings' },
      { id: 'Bisa Membela',                  en: 'Can defend the faith' },
      { id: 'Bisa Menyebarkan (Berdakwah)',  en: 'Can spread / preach' },
      { id: 'Bisa Berakhlakul Karimah',      en: 'Can uphold noble character' },
    ],
  },
  {
    parent: '3 Sukses Generus (Trisukses)',
    parentEn: '3 Successes of the Younger Generation',
    items: [
      { id: 'Faham Agama (Alim-Faqih)', en: 'Religious Understanding (Alim-Faqih)' },
      { id: 'Berakhlakul Karimah',      en: 'Noble Character' },
      { id: 'Mandiri (Kemandirian)',    en: 'Independence' },
    ],
  },
  {
    parent: '5 Sukses Pembinaan Generus (Panca Bina)',
    parentEn: '5 Successes of Youth Development',
    items: [
      { id: 'Keilmuan',          en: 'Knowledge' },
      { id: 'Kefahaman Agama',   en: 'Religious Comprehension' },
      { id: 'Akhlakul Karimah',  en: 'Noble Character' },
      { id: 'Kemandirian',       en: 'Self-reliance' },
      { id: 'Kepemimpinan',      en: 'Leadership' },
    ],
  },
  {
    parent: '6 Karakter Sosial Luhur',
    parentEn: '6 Noble Social Characters',
    items: [
      { id: 'Sopan Santun',                en: 'Politeness' },
      { id: 'Tata Krama',                  en: 'Etiquette' },
      { id: 'Toleransi',                   en: 'Tolerance' },
      { id: 'Tolong-Menolong',             en: 'Mutual Help' },
      { id: 'Hormat kepada Orang Tua/Guru', en: 'Respect to Parents/Teachers' },
      { id: 'Cinta Tanah Air',             en: 'Love of Country' },
    ],
  },
];
