/**
 * Profile — вкладка «Профиль» (мок-форма).
 * Имя/телефон/email + выбор языка чипами. Изменения локальные, не сохраняются.
 */
'use client';

import * as React from 'react';
import { Field } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';

/** Состояние формы профиля. */
interface ProfileForm {
  name: string;
  phone: string;
  email: string;
  lang: 'ru' | 'uz' | 'en';
}

const LANGS: [ProfileForm['lang'], string][] = [
  ['ru', 'Русский'],
  ['uz', 'O‘zbekcha'],
  ['en', 'English'],
];

export function Profile() {
  const [form, setForm] = React.useState<ProfileForm>({
    name: 'Алишер Авинов',
    phone: '+998 90 123 45 67',
    email: 'alisher@avino.uz',
    lang: 'ru',
  });
  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-[18px] text-[28px]">Профиль</h1>
      <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
        {/* Аватар + смена фото */}
        <div className="mb-[22px] flex items-center gap-4">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-teal text-[28px] font-extrabold text-white">
            {form.name[0]}
          </span>
          <Button variant="outline" size="sm" type="button">
            Сменить фото
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">Имя</label>
            <Field value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">Телефон</label>
            <Field value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">Email</label>
            <Field
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>
          <div>
            <label className="mb-[7px] block text-[13px] font-bold">Язык интерфейса</label>
            <div className="flex gap-2">
              {LANGS.map(([k, v]) => (
                <Pill key={k} active={form.lang === k} onClick={() => set('lang', k)}>
                  {v}
                </Pill>
              ))}
            </div>
          </div>
          <Button type="button" className="mt-1.5 self-start">
            Сохранить изменения
          </Button>
        </div>
      </div>
    </div>
  );
}
