import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from 'expo-local-authentication'
import { useCallback, useEffect, useState } from 'react'
import { useMMKVBoolean } from 'react-native-mmkv'

import { AppSettings } from '@lib/constants/GlobalValues'

const useLocalAuth = () => {
    const [success, setSuccess] = useState(false)
    const [retryCount, setRetryCount] = useState(0)
    const [hasAuth, sethasAuth] = useState(true)
    const [enabled] = useMMKVBoolean(AppSettings.LocallyAuthenticateUser)
    const authorized = !enabled || !hasAuth || success

    const retry = useCallback(() => {
        setRetryCount((item) => item + 1)
    }, [])

    useEffect(() => {
        let cancelled = false
        if (enabled && !success)
            authenticateAsync({
                promptMessage: 'Authentication Required',
            }).then((result) => {
                if (!cancelled) setSuccess(result.success)
            })
        return () => { cancelled = true }
    }, [retryCount, enabled, success])

    useEffect(() => {
        let cancelled = false
        getEnrolledLevelAsync().then((result) => {
            if (!cancelled) sethasAuth(result !== SecurityLevel.NONE)
        })
        return () => { cancelled = true }
    }, [])

    return { authorized, retry }
}

export default useLocalAuth
