// Lista de times e seleções suportados no cadastro de produtos.
// `value` é o slug salvo no banco; `label` é o que o usuário vê.
// `aliases` cobre formas alternativas de busca (ex.: "seleção brasileira" → Brasil).

export type TeamCategory =
  | "selecoes"
  | "brasileirao"
  | "espanha"
  | "inglaterra"
  | "italia"
  | "alemanha"
  | "franca"
  | "portugal"
  | "argentina"
  | "arabia"
  | "americas"
  | "outros";

export type TeamOption = {
  value: string;
  label: string;
  category: TeamCategory;
  aliases?: string[];
};

export const TEAM_CATEGORY_LABELS: Record<TeamCategory, string> = {
  selecoes: "Seleções",
  brasileirao: "Brasileirão Série A 2026",
  espanha: "Espanha",
  inglaterra: "Inglaterra",
  italia: "Itália",
  alemanha: "Alemanha",
  franca: "França",
  portugal: "Portugal",
  argentina: "Argentina",
  arabia: "Arábia Saudita",
  americas: "Américas",
  outros: "Outros clubes",
};

// Atual Copa do Mundo 2026 + Itália — o "Brasil - Seleção Brasileira"
// é colocado primeiro porque é o mais selecionado.
const SELECOES: TeamOption[] = [
  { value: "selecao-brasil", label: "Brasil - Seleção Brasileira", category: "selecoes", aliases: ["brasil", "selecao brasileira", "seleção brasileira", "canarinho"] },
  { value: "selecao-argentina", label: "Argentina - Seleção Argentina", category: "selecoes", aliases: ["argentina", "selecao argentina", "albiceleste"] },
  { value: "selecao-uruguai", label: "Uruguai - Seleção Uruguaia", category: "selecoes", aliases: ["uruguai", "selecao uruguaia", "celeste"] },
  { value: "selecao-colombia", label: "Colômbia - Seleção Colombiana", category: "selecoes", aliases: ["colombia"] },
  { value: "selecao-equador", label: "Equador - Seleção Equatoriana", category: "selecoes", aliases: ["equador"] },
  { value: "selecao-paraguai", label: "Paraguai - Seleção Paraguaia", category: "selecoes", aliases: ["paraguai"] },
  { value: "selecao-eua", label: "Estados Unidos - Seleção dos EUA", category: "selecoes", aliases: ["eua", "estados unidos", "usa"] },
  { value: "selecao-mexico", label: "México - Seleção Mexicana", category: "selecoes", aliases: ["mexico"] },
  { value: "selecao-canada", label: "Canadá - Seleção Canadense", category: "selecoes", aliases: ["canada"] },
  { value: "selecao-costa-rica", label: "Costa Rica - Seleção Costarriquenha", category: "selecoes", aliases: ["costa rica"] },
  { value: "selecao-jamaica", label: "Jamaica - Seleção Jamaicana", category: "selecoes" },
  { value: "selecao-inglaterra", label: "Inglaterra - Seleção Inglesa", category: "selecoes", aliases: ["inglaterra", "selecao inglesa", "england"] },
  { value: "selecao-franca", label: "França - Seleção Francesa", category: "selecoes", aliases: ["franca", "selecao francesa", "les bleus"] },
  { value: "selecao-espanha", label: "Espanha - Seleção Espanhola", category: "selecoes", aliases: ["espanha", "selecao espanhola", "la roja"] },
  { value: "selecao-alemanha", label: "Alemanha - Seleção Alemã", category: "selecoes", aliases: ["alemanha", "selecao alema"] },
  { value: "selecao-italia", label: "Itália - Seleção Italiana", category: "selecoes", aliases: ["italia", "selecao italiana", "azzurra"] },
  { value: "selecao-portugal", label: "Portugal - Seleção Portuguesa", category: "selecoes", aliases: ["portugal", "selecao portuguesa"] },
  { value: "selecao-holanda", label: "Holanda - Seleção Holandesa", category: "selecoes", aliases: ["holanda", "paises baixos"] },
  { value: "selecao-belgica", label: "Bélgica - Seleção Belga", category: "selecoes", aliases: ["belgica"] },
  { value: "selecao-croacia", label: "Croácia - Seleção Croata", category: "selecoes", aliases: ["croacia"] },
  { value: "selecao-suica", label: "Suíça - Seleção Suíça", category: "selecoes", aliases: ["suica"] },
  { value: "selecao-dinamarca", label: "Dinamarca - Seleção Dinamarquesa", category: "selecoes", aliases: ["dinamarca"] },
  { value: "selecao-austria", label: "Áustria - Seleção Austríaca", category: "selecoes", aliases: ["austria"] },
  { value: "selecao-servia", label: "Sérvia - Seleção Sérvia", category: "selecoes", aliases: ["servia"] },
  { value: "selecao-polonia", label: "Polônia - Seleção Polonesa", category: "selecoes", aliases: ["polonia"] },
  { value: "selecao-turquia", label: "Turquia - Seleção Turca", category: "selecoes", aliases: ["turquia"] },
  { value: "selecao-escocia", label: "Escócia - Seleção Escocesa", category: "selecoes", aliases: ["escocia"] },
  { value: "selecao-noruega", label: "Noruega - Seleção Norueguesa", category: "selecoes", aliases: ["noruega"] },
  { value: "selecao-japao", label: "Japão - Seleção Japonesa", category: "selecoes", aliases: ["japao"] },
  { value: "selecao-coreia-sul", label: "Coreia do Sul - Seleção Sul-Coreana", category: "selecoes", aliases: ["coreia do sul", "coreia"] },
  { value: "selecao-ira", label: "Irã - Seleção Iraniana", category: "selecoes", aliases: ["ira"] },
  { value: "selecao-australia", label: "Austrália - Seleção Australiana", category: "selecoes", aliases: ["australia"] },
  { value: "selecao-arabia", label: "Arábia Saudita - Seleção Saudita", category: "selecoes", aliases: ["arabia saudita", "arabia"] },
  { value: "selecao-catar", label: "Catar - Seleção Catariana", category: "selecoes", aliases: ["catar", "qatar"] },
  { value: "selecao-uzbequistao", label: "Uzbequistão - Seleção Uzbeque", category: "selecoes", aliases: ["uzbequistao"] },
  { value: "selecao-jordania", label: "Jordânia - Seleção Jordaniana", category: "selecoes", aliases: ["jordania"] },
  { value: "selecao-marrocos", label: "Marrocos - Seleção Marroquina", category: "selecoes", aliases: ["marrocos"] },
  { value: "selecao-senegal", label: "Senegal - Seleção Senegalesa", category: "selecoes", aliases: ["senegal"] },
  { value: "selecao-egito", label: "Egito - Seleção Egípcia", category: "selecoes", aliases: ["egito"] },
  { value: "selecao-tunisia", label: "Tunísia - Seleção Tunisiana", category: "selecoes", aliases: ["tunisia"] },
  { value: "selecao-argelia", label: "Argélia - Seleção Argelina", category: "selecoes", aliases: ["argelia"] },
  { value: "selecao-gana", label: "Gana - Seleção Ganesa", category: "selecoes", aliases: ["gana"] },
  { value: "selecao-nigeria", label: "Nigéria - Seleção Nigeriana", category: "selecoes", aliases: ["nigeria"] },
  { value: "selecao-camaroes", label: "Camarões - Seleção Camaronesa", category: "selecoes", aliases: ["camaroes"] },
  { value: "selecao-costa-marfim", label: "Costa do Marfim - Seleção Marfinense", category: "selecoes", aliases: ["costa do marfim"] },
  { value: "selecao-africa-sul", label: "África do Sul - Seleção Sul-Africana", category: "selecoes", aliases: ["africa do sul"] },
  { value: "selecao-nova-zelandia", label: "Nova Zelândia - Seleção Neozelandesa", category: "selecoes", aliases: ["nova zelandia"] },
  { value: "selecao-bolivia", label: "Bolívia - Seleção Boliviana", category: "selecoes", aliases: ["bolivia"] },
];

const BRASILEIRAO: TeamOption[] = [
  "Flamengo","Palmeiras","Cruzeiro","Botafogo","São Paulo","Mirassol","Bahia","Fluminense",
  "Vasco da Gama","Internacional","Grêmio","Atlético Mineiro","Corinthians","Red Bull Bragantino",
  "Ceará","Sport Recife","Vitória","Santos","Fortaleza","Juventude","Coritiba","Athletico Paranaense",
  "Goiás","Remo","Avaí","Chapecoense","Ponte Preta","Náutico","América Mineiro","Cuiabá",
].map((n) => ({ value: `br-${slug(n)}`, label: n, category: "brasileirao" }));

const ESPANHA: TeamOption[] = [
  "Real Madrid","Barcelona","Atlético de Madrid","Sevilla","Valencia","Villarreal",
  "Real Sociedad","Athletic Bilbao","Real Betis","Girona",
].map((n) => ({ value: `es-${slug(n)}`, label: n, category: "espanha" }));

const INGLATERRA: TeamOption[] = [
  "Manchester City","Manchester United","Liverpool","Chelsea","Arsenal","Tottenham",
  "Newcastle","Aston Villa","West Ham","Everton",
].map((n) => ({ value: `en-${slug(n)}`, label: n, category: "inglaterra" }));

const ITALIA: TeamOption[] = [
  "Juventus","Inter de Milão","AC Milan","Napoli","Roma","Lazio","Atalanta",
  "Fiorentina","Bologna","Torino",
].map((n) => ({ value: `it-${slug(n)}`, label: n, category: "italia" }));

const ALEMANHA: TeamOption[] = [
  "Bayern de Munique","Borussia Dortmund","RB Leipzig","Bayer Leverkusen",
  "Eintracht Frankfurt","Wolfsburg","Borussia Mönchengladbach","Stuttgart",
  "Hoffenheim","Schalke 04",
].map((n) => ({ value: `de-${slug(n)}`, label: n, category: "alemanha" }));

const FRANCA: TeamOption[] = [
  "Paris Saint-Germain","Olympique de Marseille","Olympique Lyonnais","AS Monaco",
  "LOSC Lille","OGC Nice","Rennes","RC Lens","Nantes","Bordeaux",
].map((n) => ({ value: `fr-${slug(n)}`, label: n, category: "franca" }));

const PORTUGAL: TeamOption[] = [
  "Benfica","Porto","Sporting CP","Sporting de Braga","Vitória SC","Boavista",
  "Marítimo","Belenenses","Rio Ave","Gil Vicente",
].map((n) => ({ value: `pt-${slug(n)}`, label: n, category: "portugal" }));

const ARGENTINA: TeamOption[] = [
  "Boca Juniors","River Plate","Racing Club","Independiente","San Lorenzo","Estudiantes",
  "Vélez Sarsfield","Newell's Old Boys","Rosario Central","Lanús",
].map((n) => ({ value: `ar-${slug(n)}`, label: n, category: "argentina" }));

const ARABIA: TeamOption[] = [
  "Al-Hilal","Al-Nassr","Al-Ittihad","Al-Ahli","Al-Shabab","Al-Ettifaq",
  "Al-Fateh","Al-Taawoun","Al-Raed","Al-Fayha",
].map((n) => ({ value: `sa-${slug(n)}`, label: n, category: "arabia" }));

const AMERICAS: TeamOption[] = [
  "Peñarol","Nacional (Uruguai)","Olimpia","Colo-Colo","Universidad de Chile",
  "América de Cali","Atlético Nacional","Millonarios","LDU Quito","Barcelona SC",
  "Tigres","Club América","Chivas","Cruz Azul","Pumas UNAM","Monterrey",
  "LA Galaxy","Inter Miami",
].map((n) => ({ value: `am-${slug(n)}`, label: n, category: "americas" }));

const OUTROS: TeamOption[] = [
  "Ajax","PSV Eindhoven","Feyenoord","Celtic","Rangers","Galatasaray",
  "Fenerbahçe","Beşiktaş","Olympiacos","Panathinaikos","Shakhtar Donetsk",
  "Dinamo Zagreb","Red Bull Salzburg","Anderlecht","Club Brugge",
].map((n) => ({ value: `ot-${slug(n)}`, label: n, category: "outros" }));

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const TEAMS: TeamOption[] = [
  ...SELECOES,
  ...BRASILEIRAO,
  ...ESPANHA,
  ...INGLATERRA,
  ...ITALIA,
  ...ALEMANHA,
  ...FRANCA,
  ...PORTUGAL,
  ...ARGENTINA,
  ...ARABIA,
  ...AMERICAS,
  ...OUTROS,
];

export const DEFAULT_TEAM_VALUE = "selecao-brasil";

export function findTeam(value: string | null | undefined): TeamOption | undefined {
  if (!value) return undefined;
  return TEAMS.find((t) => t.value === value);
}

export function teamLabel(value: string | null | undefined): string {
  return findTeam(value)?.label ?? value ?? "";
}

export function searchTeams(query: string): TeamOption[] {
  const q = slug(query.trim());
  if (!q) return TEAMS;
  return TEAMS.filter((t) => {
    if (slug(t.label).includes(q)) return true;
    if (t.aliases?.some((a) => slug(a).includes(q))) return true;
    return false;
  });
}

// ===== Tipos de produto, modelos, gêneros e tamanhos =====

export const PRODUCT_TYPES = [
  { value: "camisa_torcedor", label: "Camisa torcedor" },
  { value: "camisa_jogador", label: "Camisa jogador" },
  { value: "kit_infantil", label: "Kit infantil" },
  { value: "manga_longa", label: "Manga longa" },
  { value: "conjunto_agasalho", label: "Conjunto agasalho" },
  { value: "short", label: "Short" },
  { value: "jaqueta", label: "Jaqueta" },
  { value: "calca", label: "Calça" },
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number]["value"];

export const productTypeLabel = (v: string | null | undefined) =>
  PRODUCT_TYPES.find((p) => p.value === v)?.label ?? v ?? "";

export const MODELS = [
  { value: "1", label: "Camisa 1 (Home)" },
  { value: "2", label: "Camisa 2 (Away)" },
  { value: "3", label: "Camisa 3 (Third)" },
  { value: "treino_1", label: "Camisa de treino 1" },
  { value: "treino_2", label: "Camisa de treino 2" },
  { value: "edicao_especial", label: "Edição especial" },
] as const;

export const modelLabel = (v: string | null | undefined) =>
  MODELS.find((m) => m.value === v)?.label ?? v ?? "";

export const GENDERS = [
  { value: "masculina", label: "Masculina" },
  { value: "feminina", label: "Feminina" },
  { value: "infantil", label: "Infantil" },
] as const;

export type Gender = (typeof GENDERS)[number]["value"];

export const SIZES_ADULT = ["PP", "P", "M", "G", "GG", "2GG", "3GG", "4GG"] as const;
export const SIZES_KIDS = ["14", "16", "18", "20", "22", "24", "26", "28"] as const;

export type SizeOpt = (typeof SIZES_ADULT)[number] | (typeof SIZES_KIDS)[number];

export function sizesForGender(gender: Gender, productType?: ProductType | string | null): readonly string[] {
  if (gender === "infantil" || productType === "kit_infantil") return SIZES_KIDS;
  return SIZES_ADULT;
}

export function buildProductLabel(opts: {
  team?: string | null;
  season?: string | null;
  productType?: string | null;
  model?: string | null;
  specialEdition?: string | null;
  gender?: string | null;
}): string {
  const parts: string[] = [];
  if (opts.team) parts.push(teamLabel(opts.team));
  if (opts.productType) parts.push(productTypeLabel(opts.productType));
  if (opts.model) {
    if (opts.model === "edicao_especial" && opts.specialEdition?.trim()) {
      parts.push(`Edição especial: ${opts.specialEdition.trim()}`);
    } else {
      parts.push(modelLabel(opts.model));
    }
  }
  if (opts.season) parts.push(opts.season);
  if (opts.gender) {
    const g = opts.gender;
    parts.push(g === "masculina" ? "Masc." : g === "feminina" ? "Fem." : "Infantil");
  }
  return parts.filter(Boolean).join(" · ");
}
