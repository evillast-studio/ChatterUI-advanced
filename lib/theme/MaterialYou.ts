import type { ThemeColor } from './ThemeColor'

/**
 * Generador de esquemas estilo Material You (Material 3) a partir de un color base.
 *
 * Los "tonos" de Material 3 son la luminosidad L* de CIELAB (tono 40 = L* 40), y el matiz
 * casi no cambia a lo largo de una paleta. Por eso cada paleta se genera con el matiz del
 * color base y el croma típico de Material 3, reduciendo el croma solo cuando el color no
 * cabe en sRGB. Así la luminosidad (y con ella el contraste) queda exacta.
 */

type Rgb = [number, number, number]

const WHITE_POINT: Rgb = [0.95047, 1, 1.08883]
const EPSILON = 216 / 24389
const KAPPA = 24389 / 27

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

const labF = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
const labFInverse = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA)

const normalizeHex = (hex: string) => {
    const value = hex.trim().replace('#', '')
    const full =
        value.length === 3
            ? value
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : value
    return /^[0-9a-fA-F]{6}$/.test(full) ? full.toLowerCase() : undefined
}

/** true si es un color #RGB o #RRGGBB válido. */
export const isValidSeed = (hex: string) => normalizeHex(hex) !== undefined

const hexToLab = (hex: string): Rgb => {
    const full = normalizeHex(hex) ?? '000000'
    const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(full.slice(i, i + 2), 16) / 255))
    const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
    const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
    const fx = labF(x / WHITE_POINT[0])
    const fy = labF(y / WHITE_POINT[1])
    const fz = labF(z / WHITE_POINT[2])
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const labToLinear = (L: number, a: number, b: number): Rgb => {
    const fy = (L + 16) / 116
    const x = labFInverse(fy + a / 500) * WHITE_POINT[0]
    const y = labFInverse(fy) * WHITE_POINT[1]
    const z = labFInverse(fy - b / 200) * WHITE_POINT[2]
    return [
        3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ]
}

const GAMUT_TOLERANCE = 1e-4
const fitsInGamut = (rgb: Rgb) => rgb.every((c) => c >= -GAMUT_TOLERANCE && c <= 1 + GAMUT_TOLERANCE)

const linearToHex = (rgb: Rgb) =>
    '#' +
    rgb
        .map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, c))))) * 255))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')

const labToHex = (L: number, a: number, b: number) => linearToHex(labToLinear(L, a, b))

/** Color con luminosidad L* = tone, el matiz dado y el mayor croma (hasta `chroma`) que cabe en sRGB. */
const colorAt = (tone: number, chroma: number, hue: number) => {
    const radians = (hue * Math.PI) / 180
    const at = (c: number) => labToLinear(tone, c * Math.cos(radians), c * Math.sin(radians))
    if (fitsInGamut(at(chroma))) return linearToHex(at(chroma))
    let low = 0
    let high = chroma
    for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2
        if (fitsInGamut(at(mid))) low = mid
        else high = mid
    }
    return linearToHex(at(low))
}

/** Croma de Lab que corresponde al croma 36 de Material 3 para la paleta primaria (decrece con el tono). */
const primaryChroma = (tone: number) => Math.max(0, 63.5 - 0.335 * tone)
const TERTIARY_CHROMA = 21
/** Las superficies del tema claro llevan más color: con 4.5 se ven grises (Material 3 expresivo). */
const NEUTRAL_CHROMA_DARK = 4.5
const NEUTRAL_CHROMA_LIGHT = 11
/** Los textos principales conservan un tinte suave en ambos temas. */
const ON_SURFACE_CHROMA = 4.5
const NEUTRAL_VARIANT_CHROMA = 6.8
/** Material 3 rota 60° el matiz para la paleta terciaria (equivale a ~54° en CIELAB). */
const TERTIARY_HUE_SHIFT = 54

/** Paleta de error de Material 3: es fija (no depende del color base). Tono → color. */
const ERROR_ANCHORS: [number, string][] = [
    [0, '#000000'],
    [10, '#410e0b'],
    [20, '#601410'],
    [30, '#8c1d18'],
    [40, '#b3261e'],
    [50, '#dc362e'],
    [60, '#e46962'],
    [70, '#ec928e'],
    [80, '#f2b8b5'],
    [90, '#f9dedc'],
    [95, '#fceeee'],
    [100, '#ffffff'],
]

const errorAt = (tone: number) => {
    const upperIndex = ERROR_ANCHORS.findIndex(([anchorTone]) => anchorTone >= tone)
    if (upperIndex <= 0) return ERROR_ANCHORS[Math.max(upperIndex, 0)][1]
    const [lowTone, lowHex] = ERROR_ANCHORS[upperIndex - 1]
    const [highTone, highHex] = ERROR_ANCHORS[upperIndex]
    if (highTone === tone) return highHex
    const mix = (tone - lowTone) / (highTone - lowTone)
    const low = hexToLab(lowHex)
    const high = hexToLab(highHex)
    return labToHex(tone, low[1] + (high[1] - low[1]) * mix, low[2] + (high[2] - low[2]) * mix)
}

type Palettes = {
    primary: (tone: number) => string
    neutral: (tone: number) => string
    onSurface: (tone: number) => string
    neutralVariant: (tone: number) => string
    tertiary: (tone: number) => string
    error: (tone: number) => string
}

const palettesFor = (seed: string, mode: 'dark' | 'light'): Palettes => {
    const [, a, b] = hexToLab(seed)
    const hue = (Math.atan2(b, a) * 180) / Math.PI
    return {
        primary: (tone) => colorAt(tone, primaryChroma(tone), hue),
        neutral: (tone) =>
            colorAt(tone, mode === 'dark' ? NEUTRAL_CHROMA_DARK : NEUTRAL_CHROMA_LIGHT, hue),
        onSurface: (tone) => colorAt(tone, ON_SURFACE_CHROMA, hue),
        neutralVariant: (tone) => colorAt(tone, NEUTRAL_VARIANT_CHROMA, hue),
        tertiary: (tone) => colorAt(tone, TERTIARY_CHROMA, hue + TERTIARY_HUE_SHIFT),
        error: errorAt,
    }
}

type Gradient = ThemeColor['primary']
type Tones = [number, number, number, number, number, number, number, number, number]

const gradient = (tones: Tones, paletteAt: (tone: number) => string): Gradient => {
    const [t1, t2, t3, t4, t5, t6, t7, t8, t9] = tones.map(paletteAt)
    return { _100: t1, _200: t2, _300: t3, _400: t4, _500: t5, _600: t6, _700: t7, _800: t8, _900: t9 }
}

/**
 * Tonos de cada nivel (_100 … _900). Mantienen la misma relación de luminosidad que los
 * esquemas originales de la app (fondo → superficies → bordes; texto principal → secundario),
 * para que ninguna combinación fondo/texto existente pierda contraste.
 *
 * Mapeo a Material 3: neutral._100/_200/_300 = surface / surfaceContainer / surfaceContainerHigh,
 * primary._500 = primary, primary._300 = primaryContainer, text._100 = onSurface,
 * text._400 = onSurfaceVariant, error._300 = error.
 */
const DARK = {
    primary: [10, 20, 30, 50, 80, 82, 85, 90, 95],
    neutral: [6, 12, 18, 24, 36, 48, 58, 68, 78],
    error: [95, 90, 80, 70, 40, 30, 20, 20, 20],
    text: [93, 88, 80, 71, 60, 48, 36, 22, 10],
} satisfies Record<string, Tones>

const LIGHT = {
    primary: [96, 90, 80, 66, 40, 36, 32, 28, 22],
    neutral: [98, 94, 90, 86, 80, 70, 50, 38, 26],
    error: [92, 85, 45, 45, 45, 38, 32, 25, 19],
    text: [10, 20, 30, 42, 52, 62, 76, 90, 98],
} satisfies Record<string, Tones>

const buildScheme = (seed: string, mode: 'dark' | 'light', name: string): ThemeColor => {
    const palettes = palettesFor(seed, mode)
    const tones = mode === 'dark' ? DARK : LIGHT
    // onSurface (los textos más intensos) usa la paleta neutra; el resto, la neutra variante
    const isOnSurface = (tone: number) => (mode === 'dark' ? tone >= 85 : tone <= 25)
    const textAt = (tone: number) =>
        isOnSurface(tone) ? palettes.onSurface(tone) : palettes.neutralVariant(tone)
    return {
        version: 1,
        name,
        primary: gradient(tones.primary, palettes.primary),
        neutral: gradient(tones.neutral, palettes.neutral),
        error: gradient(tones.error, palettes.error),
        text: gradient(tones.text, textAt),
        quote: palettes.tertiary(mode === 'dark' ? 80 : 40),
        shadow: '#000000',
    }
}

/** Color base de la paleta estándar de Material 3. */
export const MATERIAL_YOU_BASE_SEED = '#6750A4'

/** Colores base sugeridos en el selector. */
export const MATERIAL_YOU_SEEDS: { name: string; hex: string }[] = [
    { name: 'Violeta', hex: '#6750A4' },
    { name: 'Azul', hex: '#0B57D0' },
    { name: 'Cian', hex: '#006874' },
    { name: 'Verde', hex: '#2E7D32' },
    { name: 'Lima', hex: '#6B8E23' },
    { name: 'Ámbar', hex: '#C79100' },
    { name: 'Naranja', hex: '#E65100' },
    { name: 'Rojo', hex: '#BA1A1A' },
    { name: 'Rosa', hex: '#C2185B' },
    { name: 'Magenta', hex: '#8E24AA' },
]

/** Nombre normalizado de un color base: "#6750A4". */
export const seedLabel = (seed: string) => `#${(normalizeHex(seed) ?? '000000').toUpperCase()}`

/** Nombres de los esquemas oscuro y claro de un color base. */
export const materialYouNames = (seed: string) => {
    const base =
        seedLabel(seed) === seedLabel(MATERIAL_YOU_BASE_SEED)
            ? 'Material You'
            : `Material You ${seedLabel(seed)}`
    return { dark: `${base} Dark`, light: `${base} Light` }
}

/** Genera los esquemas oscuro y claro de un color base. */
export const materialYouSchemes = (seed: string): { dark: ThemeColor; light: ThemeColor } => {
    const names = materialYouNames(seed)
    return {
        dark: buildScheme(seed, 'dark', names.dark),
        light: buildScheme(seed, 'light', names.light),
    }
}
