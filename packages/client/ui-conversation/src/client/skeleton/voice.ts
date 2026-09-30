/**
 * Minimal structural typings + ctor lookup for the Web Speech API
 * (speech recognition). lib.dom carries no typings for the
 * `webkitSpeechRecognition` legacy name and engines still ship the API under
 * it, so the surface is declared here structurally — only the members the
 * composer's voice input consumes.
 */

/** One alternative of one recognition result (index [0] is the best). */
export interface SpeechAlternativeLike {
  transcript: string
}

/** One result: final or interim, holding `length` alternatives. */
export interface SpeechResultLike {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechAlternativeLike
}

/** The result list of an onresult event. */
export interface SpeechResultListLike {
  readonly length: number
  [index: number]: SpeechResultLike
}

/** The onresult event (resultIndex = first changed result). */
export interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechResultListLike
}

/** The onerror event (only `error` is read). */
export interface SpeechRecognitionErrorEventLike {
  readonly error: string
}

/** The recognition surface the composer drives (push-to-talk). */
export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
}

/** Constructor shape of the recognition API. */
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/**
 * Resolve the platform's recognition constructor, or null where the API is
 * absent (Firefox, jsdom) — the caller then keeps the native space path.
 */
export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}
