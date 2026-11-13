import { SuiteProfileSettings, EnabledModules } from '../types';

export const OCHRE_COLOR_PRESETS = [
  { name: 'Klassik Ocker', hex: '#C87D20' },
  { name: 'Terrakotta Ocker', hex: '#C26D2D' },
  { name: 'Kupfer Siena', hex: '#B87333' },
  { name: 'Bronze Amber', hex: '#8E6126' },
  { name: 'Röst-Ocker', hex: '#B45309' },
  { name: 'Senf Gold', hex: '#A67C21' },
  { name: 'Umbra Dunkel', hex: '#6D4C2F' },
  { name: 'Salbei Olive', hex: '#6E7F4F' },
];

export const DEFAULT_ENABLED_MODULES: EnabledModules = {
  notes: true,
  wiki: true,
  recipes: true,
  finance: true,
};

export const DEFAULT_PROFILE_SETTINGS: SuiteProfileSettings = {
  enableSecondProfile: true,
  activeProfileId: 'profile1',
  profile1: {
    id: 'profile1',
    name: 'Privat',
    colors: {
      notes: '#C87D20',
      wiki: '#B87333',
      recipes: '#C26D2D',
      finance: '#8E6126',
    },
  },
  profile2: {
    id: 'profile2',
    name: 'Business',
    colors: {
      notes: '#8F5E1E',
      wiki: '#9E6B2B',
      recipes: '#B45309',
      finance: '#6D4C2F',
    },
  },
};
