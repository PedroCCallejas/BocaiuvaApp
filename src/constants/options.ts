import type {
  FootPreference,
  LegacyRatingCriterionId,
  MatchStatus,
  MatchType,
  PlayerStatus,
  Position,
  RatingCriterionType,
} from '@/types/domain';

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  society: 'Society',
  futsal: 'Futsal',
  field: 'Campo',
  training: 'Treino',
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  finished: 'Encerrado',
  canceled: 'Cancelado',
};

export const PLAYER_STATUS_LABELS: Record<PlayerStatus, string> = {
  active: 'Ativo',
  injured: 'Lesionado',
  suspended: 'Suspenso',
  inactive: 'Inativo',
};

export const FOOT_LABELS: Record<FootPreference, string> = {
  right: 'Direito',
  left: 'Esquerdo',
  both: 'Ambos',
};

export const POSITION_LABELS: Record<Position, string> = {
  goalkeeper: 'Goleiro',
  'right-back': 'Lateral direito',
  'center-back': 'Zagueiro',
  'left-back': 'Lateral esquerdo',
  'wing-back': 'Ala',
  'defensive-midfielder': 'Volante',
  midfielder: 'Meio-campo',
  'attacking-midfielder': 'Meia ofensivo',
  winger: 'Ponta',
  forward: 'Segundo atacante',
  striker: 'Centroavante',
};

export const POSITION_OPTIONS: Position[] = [
  'goalkeeper',
  'right-back',
  'center-back',
  'left-back',
  'wing-back',
  'defensive-midfielder',
  'midfielder',
  'attacking-midfielder',
  'winger',
  'forward',
  'striker',
];

export const PLAYER_STATUS_OPTIONS: PlayerStatus[] = [
  'active',
  'injured',
  'suspended',
  'inactive',
];

export const FOOT_OPTIONS: FootPreference[] = ['right', 'left', 'both'];

export const RATING_CRITERIA_ORDER: LegacyRatingCriterionId[] = [
  'dedicacao',
  'energia',
  'qualidade',
  'decisivo',
  'preciosismo',
  'reclamacao',
  'fominha',
  'marra',
];

export const RATING_CRITERIA_LABELS: Record<LegacyRatingCriterionId, string> = {
  dedicacao: 'Dedicacao',
  energia: 'Energia',
  qualidade: 'Qualidade',
  decisivo: 'Decisivo',
  preciosismo: 'Preciosismo',
  reclamacao: 'Reclamacao',
  fominha: 'Fominha',
  marra: 'Marra',
};

export const RATING_CRITERIA_TYPES: Record<LegacyRatingCriterionId, RatingCriterionType> = {
  dedicacao: 'positive',
  energia: 'positive',
  qualidade: 'positive',
  decisivo: 'positive',
  preciosismo: 'negative',
  reclamacao: 'negative',
  fominha: 'negative',
  marra: 'negative',
};

export const DEFAULT_ACTIVE_RATING_CRITERIA_IDS: LegacyRatingCriterionId[] = [
  'dedicacao',
  'energia',
  'qualidade',
  'decisivo',
  'reclamacao',
  'fominha',
];

export interface TeamColorPreset {
  id: string;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  accent?: string;
}

export const TEAM_COLOR_PRESETS = [
  {
    id: 'classic-blue',
    name: 'Classico Azul',
    description: 'Azul escuro com branco e detalhes vibrantes.',
    primary: '#163A70',
    secondary: '#F4F7FB',
    accent: '#5FA8FF',
  },
  {
    id: 'rubro-negro',
    name: 'Rubro-Negro',
    description: 'Vermelho forte com base preta.',
    primary: '#B21E24',
    secondary: '#121417',
    accent: '#F1D7A8',
  },
  {
    id: 'green-field',
    name: 'Verde Campo',
    description: 'Verde tradicional com branco limpo.',
    primary: '#0E7A43',
    secondary: '#F5F8F3',
    accent: '#A7E063',
  },
  {
    id: 'golden-fc',
    name: 'Dourado FC',
    description: 'Azul marinho com dourado elegante.',
    primary: '#12263F',
    secondary: '#D7A11E',
    accent: '#F3E2A3',
  },
  {
    id: 'purple-elite',
    name: 'Roxo Elite',
    description: 'Roxo profundo com contraste escuro.',
    primary: '#5A2A82',
    secondary: '#16121B',
    accent: '#D9B7FF',
  },
  {
    id: 'orange-energy',
    name: 'Laranja Energia',
    description: 'Laranja vibrante com grafite.',
    primary: '#E06A1E',
    secondary: '#24272C',
    accent: '#FFD1A8',
  },
  {
    id: 'celeste',
    name: 'Celeste',
    description: 'Azul claro com branco arejado.',
    primary: '#5CB6E8',
    secondary: '#F7FBFE',
    accent: '#157AB5',
  },
  {
    id: 'tricolor',
    name: 'Tricolor',
    description: 'Azul, vermelho e branco em equilibrio.',
    primary: '#18407D',
    secondary: '#FFFFFF',
    accent: '#C92A2A',
  },
] satisfies TeamColorPreset[];

export const LINE_PLAYER_OPTIONS = [4, 5, 6, 10];
