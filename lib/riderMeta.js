export const RIDER_META = {
  'Johann Zarco': { number: 5, team: 'Honda LCR', bike: 'Honda RC213V', teamClass: 'lcr', flag:'🇫🇷', country:'Francia' },
  'Toprak Razgatlioglu': { number: 7, team: 'Prima Pramac Yamaha MotoGP', bike: 'Yamaha YZR-M1', teamClass: 'pramac', flag:'🇹🇷', country:'Turchia' },
  'Luca Marini': { number: 10, team: 'Honda HRC Castrol', bike: 'Honda RC213V', teamClass: 'honda', flag:'🇮🇹', country:'Italia' },
  'Diogo Moreira': { number: 11, team: 'Honda LCR', bike: 'Honda RC213V', teamClass: 'lcr', flag:'🇧🇷', country:'Brasile' },
  'Maverick Vinales': { number: 12, team: 'Red Bull KTM Tech3', bike: 'KTM RC16', teamClass: 'tech3', flag:'🇪🇸', country:'Spagna' },
  'Fabio Quartararo': { number: 20, team: 'Monster Energy Yamaha MotoGP', bike: 'Yamaha YZR-M1', teamClass: 'yamaha', flag:'🇫🇷', country:'Francia' },
  'Franco Morbidelli': { number: 21, team: 'Pertamina Enduro VR46 Racing Team', bike: 'Ducati Desmosedici GP', teamClass: 'vr46', flag:'🇮🇹', country:'Italia' },
  'Enea Bastianini': { number: 23, team: 'Red Bull KTM Tech3', bike: 'KTM RC16', teamClass: 'tech3', flag:'🇮🇹', country:'Italia' },
  'Raul Fernandez': { number: 25, team: 'SuperFile Trackhouse MotoGP Team', bike: 'Aprilia RS-GP', teamClass: 'trackhouse', flag:'🇪🇸', country:'Spagna' },
  'Brad Binder': { number: 33, team: 'Red Bull KTM Factory Racing', bike: 'KTM RC16', teamClass: 'ktm', flag:'🇿🇦', country:'Sudafrica' },
  'Joan Mir': { number: 36, team: 'Honda HRC Castrol', bike: 'Honda RC213V', teamClass: 'honda', flag:'🇪🇸', country:'Spagna' },
  'Pedro Acosta': { number: 37, team: 'Red Bull KTM Factory Racing', bike: 'KTM RC16', teamClass: 'ktm', flag:'🇪🇸', country:'Spagna' },
  'Alex Rins': { number: 42, team: 'Monster Energy Yamaha MotoGP', bike: 'Yamaha YZR-M1', teamClass: 'yamaha', flag:'🇪🇸', country:'Spagna' },
  'Jack Miller': { number: 43, team: 'Prima Pramac Yamaha MotoGP', bike: 'Yamaha YZR-M1', teamClass: 'pramac', flag:'🇦🇺', country:'Australia' },
  'Fabio Di Giannantonio': { number: 49, team: 'Pertamina Enduro VR46 Racing Team', bike: 'Ducati Desmosedici GP', teamClass: 'vr46', flag:'🇮🇹', country:'Italia' },
  'Fermin Aldeguer': { number: 54, team: 'BK8 Gresini Racing MotoGP', bike: 'Ducati Desmosedici GP', teamClass: 'gresini', flag:'🇪🇸', country:'Spagna' },
  'Francesco Bagnaia': { number: 63, team: 'Ducati Lenovo Team', bike: 'Ducati Desmosedici GP', teamClass: 'ducati', flag:'🇮🇹', country:'Italia' },
  'Marco Bezzecchi': { number: 72, team: 'Aprilia Racing', bike: 'Aprilia RS-GP', teamClass: 'aprilia', flag:'🇮🇹', country:'Italia' },
  'Alex Marquez': { number: 73, team: 'BK8 Gresini Racing MotoGP', bike: 'Ducati Desmosedici GP', teamClass: 'gresini', flag:'🇪🇸', country:'Spagna' },
  'Ai Ogura': { number: 79, team: 'SuperFile Trackhouse MotoGP Team', bike: 'Aprilia RS-GP', teamClass: 'trackhouse', flag:'🇯🇵', country:'Giappone' },
  'Jorge Martin': { number: 89, team: 'Aprilia Racing', bike: 'Aprilia RS-GP', teamClass: 'aprilia', flag:'🇪🇸', country:'Spagna' },
  'Marc Marquez': { number: 93, team: 'Ducati Lenovo Team', bike: 'Ducati Desmosedici GP', teamClass: 'ducati', flag:'🇪🇸', country:'Spagna' }
};

export function getRiderMeta(name) {
  return RIDER_META[name] || { number: null, team: '', bike: '', teamClass: '' };
}

export const TEAM_ORDER = [
  { team:'Ducati Lenovo Team', bike:'Ducati', teamClass:'ducati', riders:['Francesco Bagnaia #63','Marc Marquez #93'] },
  { team:'Aprilia Racing', bike:'Aprilia', teamClass:'aprilia', riders:['Marco Bezzecchi #72','Jorge Martin #89'] },
  { team:'BK8 Gresini Racing MotoGP', bike:'Ducati', teamClass:'gresini', riders:['Fermin Aldeguer #54','Alex Marquez #73'] },
  { team:'Honda HRC Castrol', bike:'Honda', teamClass:'honda', riders:['Luca Marini #10','Joan Mir #36'] },
  { team:'Honda LCR', bike:'Honda', teamClass:'lcr', riders:['Johann Zarco #5','Diogo Moreira #11'] },
  { team:'Monster Energy Yamaha MotoGP', bike:'Yamaha', teamClass:'yamaha', riders:['Fabio Quartararo #20','Alex Rins #42'] },
  { team:'Pertamina Enduro VR46 Racing Team', bike:'Ducati', teamClass:'vr46', riders:['Franco Morbidelli #21','Fabio Di Giannantonio #49'] },
  { team:'Prima Pramac Yamaha MotoGP', bike:'Yamaha', teamClass:'pramac', riders:['Toprak Razgatlioglu #7','Jack Miller #43'] },
  { team:'Red Bull KTM Factory Racing', bike:'KTM', teamClass:'ktm', riders:['Brad Binder #33','Pedro Acosta #37'] },
  { team:'Red Bull KTM Tech3', bike:'KTM', teamClass:'tech3', riders:['Maverick Vinales #12','Enea Bastianini #23'] },
  { team:'SuperFile Trackhouse MotoGP Team', bike:'Aprilia', teamClass:'trackhouse', riders:['Raul Fernandez #25','Ai Ogura #79'] }
];
