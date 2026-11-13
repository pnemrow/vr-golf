// Club specifications.
//  loft      static loft (deg)
//  lie       lie angle (deg), used for the head model
//  length    shaft length (m) from hands to the face centre
//  headMass  kg
//  smash     target smash factor for a centred strike at nominal spin loft
//  spinK     spin rate (rpm) per (m/s of club speed * sin(spin loft)); calibrated
//            to launch-monitor averages (woods spin less than grooved irons)
//  faceDom   share of start direction set by the face (rest is the path)
//  gear      gear effect (deg of spin-axis tilt per cm of toe/heel strike)
//  kind      'wood' | 'hybrid' | 'iron' | 'wedge'

export const CLUBS = [
  { id: 'D', name: 'Driver', loft: 10.5, lie: 58, length: 1.14, headMass: 0.2, smash: 1.48, spinK: 275, faceDom: 0.86, gear: 4, kind: 'wood' },
  { id: '3W', name: '3 Wood', loft: 15, lie: 58.5, length: 1.08, headMass: 0.212, smash: 1.46, spinK: 300, faceDom: 0.85, gear: 3, kind: 'wood' },
  { id: '4H', name: '4 Hybrid', loft: 21, lie: 59.5, length: 1.02, headMass: 0.235, smash: 1.42, spinK: 320, faceDom: 0.83, gear: 1.5, kind: 'hybrid' },
  { id: '5i', name: '5 Iron', loft: 25, lie: 61, length: 0.965, headMass: 0.248, smash: 1.38, spinK: 350, faceDom: 0.8, gear: 0.5, kind: 'iron' },
  { id: '6i', name: '6 Iron', loft: 29, lie: 61.5, length: 0.952, headMass: 0.255, smash: 1.36, spinK: 362, faceDom: 0.79, gear: 0.4, kind: 'iron' },
  { id: '7i', name: '7 Iron', loft: 33, lie: 62, length: 0.94, headMass: 0.262, smash: 1.34, spinK: 375, faceDom: 0.78, gear: 0.3, kind: 'iron' },
  { id: '8i', name: '8 Iron', loft: 37, lie: 62.5, length: 0.927, headMass: 0.27, smash: 1.31, spinK: 382, faceDom: 0.77, gear: 0.3, kind: 'iron' },
  { id: '9i', name: '9 Iron', loft: 41, lie: 63, length: 0.914, headMass: 0.278, smash: 1.28, spinK: 388, faceDom: 0.76, gear: 0.2, kind: 'iron' },
  { id: 'PW', name: 'Pitching Wedge', loft: 46, lie: 63.5, length: 0.902, headMass: 0.288, smash: 1.24, spinK: 392, faceDom: 0.75, gear: 0.2, kind: 'wedge' },
  { id: 'GW', name: 'Gap Wedge', loft: 50, lie: 64, length: 0.895, headMass: 0.296, smash: 1.2, spinK: 395, faceDom: 0.74, gear: 0.1, kind: 'wedge' },
  { id: 'SW', name: 'Sand Wedge', loft: 56, lie: 64, length: 0.89, headMass: 0.3, smash: 1.14, spinK: 395, faceDom: 0.72, gear: 0.1, kind: 'wedge' },
  { id: 'LW', name: 'Lob Wedge', loft: 60, lie: 64, length: 0.89, headMass: 0.304, smash: 1.08, spinK: 390, faceDom: 0.7, gear: 0.1, kind: 'wedge' },
];

export const clubById = (id) => CLUBS.find((c) => c.id === id);
