'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let ativo = true

    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!ativo) return
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (ativo) setProfile(profile)
      }

      if (ativo) setLoading(false)
    }

    carregar()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      carregar()
    })

    return () => {
      ativo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { user, profile, loading, supabase }
}
