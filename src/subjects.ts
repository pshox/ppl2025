// List of PPL subjects. More JSON files should be placed under public/data/<id>.json
// Titles are in Serbian.
export const subjects = [
  { id: '01-vazduhoplovni-propisi', title: 'Vazduhoplovni propisi' },
  { id: '02-opste-poznavanje-vazduhoplova', title: 'Opšte poznavanje vazduhoplova' },
  { id: '03-performanse', title: 'Performanse i planiranje' },
  { id: '04-ljudske-mogucnosti', title: 'Ljudske mogućnosti' },
  { id: '05-meteorologija', title: 'Meteorologija' },
  { id: '06-navigacija', title: 'Navigacija' },
  { id: '07-operativne-procedure', title: 'Operativne procedure' },
  { id: '08-teorija-letenja', title: 'Teorija letenja' },
  { id: '09-komunikacije', title: 'Komunikacije' }
] as const;

export type SubjectId = typeof subjects[number]['id'];
