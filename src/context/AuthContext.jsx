import { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabase';
import { auditService } from '../services/audit';
import { AuthContext } from './useAuth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const fetchProfile = async (userId) => {
    if (fetchingRef.current) return; // Si ya está buscando, no hace nada
    fetchingRef.current = true;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
      } else if (error) {
        console.warn('Error fetching profile:', error.message);
        // Si da error 500 o 403, no rompemos la app, solo lo registramos
      }
    } catch (err) {
      console.error('Exception fetching profile:', err);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        
        if (session?.user && event !== 'INITIAL_SESSION') {
          await fetchProfile(session.user.id);
        } else if (!session) {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    auditService.log({ userId: data.user.id, userEmail: email, action: 'Inicio de sesión', module: 'Auth' });
    return data;
  };

  const signOut = async () => {
    if (profile) {
      auditService.log({ userId: user?.id, userEmail: profile?.email, action: 'Cierre de sesión', module: 'Auth' });
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    isAdmin: profile?.role === 'admin',
    isSupervisor: profile?.role === 'supervisor',
    isSupervisorPrincipal: profile?.role === 'supervisora_principal',
    areaId: profile?.area_id || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};