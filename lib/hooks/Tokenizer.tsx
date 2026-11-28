import { useState, useEffect, useRef } from 'react'

import { Tokenizer } from '@lib/engine/Tokenizer'

import { useDebounce } from './Debounce'

export function useDebounceTokenizer(text: string, delay: number) {
    const [count, setCount] = useState(0)
    const getTokenCount = Tokenizer.useTokenizerState((state) => state.getTokenCount)
    const cancelledRef = useRef(false)

    useEffect(() => {
        cancelledRef.current = false
        return () => { cancelledRef.current = true }
    }, [])

    const debouncedCountTokens = useDebounce(async () => {
        const tokenCount = await getTokenCount(text)
        if (!cancelledRef.current) setCount(tokenCount)
    }, delay)

    useEffect(() => {
        debouncedCountTokens()
    }, [text, debouncedCountTokens])

    return count
}
