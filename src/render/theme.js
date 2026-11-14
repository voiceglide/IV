// Colour tokens for the video renderer. Every colour the renderer paints comes from one of these objects,
// so a new look is one more entry here. `inkRGB` is the ink colour as "r,g,b" for the many translucent strokes.

/**
 * @typedef {{name:string, ink:string, inkRGB:string, paper:number[], glow:[string,string], vignette:[string,string],
 *   pink:string, voices:string[], meta:string, chipText:string, pillText:string, dotRing:string, keyFrame:string,
 *   keyWhite:[string,string], keyBlack:[string,string], keyShadow:string, grain:number}} Theme
 */

/** @type {Theme} */
export const PAPER = {
  name: 'paper',
  ink: '#2b2520', inkRGB: '43,37,32', paper: [243, 236, 223],
  glow: ['rgba(255,253,248,.7)', 'rgba(255,253,248,0)'], vignette: ['rgba(90,70,45,0)', 'rgba(90,70,45,.09)'],
  pink: '#c2385f',
  voices: ['#b0574e', '#6c5aa8', '#3f72b0', '#3d8a66', '#c08a3e', '#5b5148'], // bass in brick, then the upper voices top-down
  meta: '#6b625a', chipText: '#f6efe3', pillText: '#fffdf8', dotRing: '#fffdf8',
  keyFrame: '#231e1a', keyWhite: ['#fffdf8', '#ece3d4'], keyBlack: ['#3d352e', '#1c1814'], keyShadow: 'rgba(43,37,32,.25)', grain: 9,
};

/** @type {Theme} */
export const NIGHT = {
  name: 'night',
  ink: '#f1ebe0', inkRGB: '241,235,224', paper: [22, 20, 27],
  glow: ['rgba(80,66,112,.42)', 'rgba(80,66,112,0)'], vignette: ['rgba(0,0,0,0)', 'rgba(0,0,0,.38)'],
  pink: '#ff7a9c',
  voices: ['#e0786d', '#9d89e6', '#6fa5ec', '#5cc79a', '#e4b25e', '#aa9e92'],
  meta: '#a69d92', chipText: '#1b1714', pillText: '#17130f', dotRing: '#17141a', keyFrame: '#0b090d',
  keyWhite: ['#f4eee3', '#d6ccbc'], keyBlack: ['#2c2733', '#0f0d12'], keyShadow: 'rgba(0,0,0,.55)', grain: 7,
};

export const THEMES = { paper: PAPER, night: NIGHT };

/** @param {string|Theme|undefined} t @returns {Theme} */
export function resolveTheme(t) {
  if (!t) return PAPER;
  if (typeof t === 'string') return THEMES[/** @type {'paper'|'night'} */(t)] || PAPER;
  return { ...PAPER, ...t };
}
