'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Camera, User, Check } from 'lucide-react';

interface EditarPerfilModalProps {
  userId: string;
  currentUsername: string;
  currentAvatarUrl?: string | null;
  onClose: () => void;
  onSaved: (nuevoUsername: string, nuevoAvatarUrl: string | null) => void;
}

export default function EditarPerfilModal({
  userId,
  currentUsername,
  currentAvatarUrl,
  onClose,
  onSaved,
}: EditarPerfilModalProps) {
  const [nick, setNick] = useState(currentUsername || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl || null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      setErrorMsg('Selecciona una imagen válida (JPG, PNG o WEBP).');
      return;
    }

    if (archivo.size > 2 * 1024 * 1024) {
      setErrorMsg('La imagen no puede superar los 2 MB.');
      return;
    }

    setErrorMsg(null);
    setSubiendoFoto(true);

    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const rutaArchivo = `${userId}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(rutaArchivo, archivo, { upsert: true });

    if (uploadError) {
      setErrorMsg('No se pudo subir la foto. Revisa el bucket "avatars" en Supabase.');
      setSubiendoFoto(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(rutaArchivo);

    setAvatarUrl(publicUrlData.publicUrl);
    setSubiendoFoto(false);
  }

  async function handleGuardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    const nickLimpio = nick.trim().replace(/^@+/, '');
    if (nickLimpio.length < 2 || nickLimpio.length > 24) {
      setErrorMsg('El nick debe tener entre 2 y 24 caracteres.');
      return;
    }

    setErrorMsg(null);
    setGuardando(true);

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          username: nickLimpio,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) {
      setErrorMsg('No se pudo guardar el perfil. ¿Quizá ese nick ya está en uso?');
      setGuardando(false);
      return;
    }

    onSaved(nickLimpio, avatarUrl);
    setGuardando(false);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white">Editar perfil</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleGuardarPerfil} className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={nick || 'Avatar'}
                  className="h-24 w-24 rounded-2xl border-2 border-indigo-500/50 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-900 text-slate-400">
                  <User className="h-10 w-10" />
                </div>
              )}

              <label className="absolute -bottom-2 -right-2 flex cursor-pointer items-center gap-1 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg transition hover:bg-indigo-500">
                <Camera className="h-3.5 w-3.5" />
                <span>{subiendoFoto ? 'Subiendo...' : 'Foto'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSubirFoto}
                  disabled={subiendoFoto}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Nick (@usuario)
            </label>
            <input
              type="text"
              maxLength={24}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Tu nick"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
              {errorMsg}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || subiendoFoto}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}