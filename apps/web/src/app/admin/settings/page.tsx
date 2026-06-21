/**
 * Настройки (порт Settings из scripts/admin-pages.jsx).
 * Конфигурация платформы — статичная форма (server-компонент). 1:1 с прототипом.
 */
import { SectionTitle } from '@/components/admin/ui/section-title';
import { TelegramNotificationsToggle } from '@/components/admin/TelegramNotificationsToggle';
import { SmsSendingToggle } from '@/components/admin/SmsSendingToggle';
import { PromotionsAvailabilityToggle } from '@/components/admin/PromotionsAvailabilityToggle';
import { ExchangeRatePanel } from '@/components/admin/ExchangeRatePanel';

export default function SettingsPage() {
  return (
    <div>
      <SectionTitle sub="Конфигурация платформы">Настройки</SectionTitle>
      <div className="a-card" style={{ padding: 24, maxWidth: 640 }}>
        <div className="row gap-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 18 }}>
          {['Общие', 'Районы', 'Роли', 'Интеграции'].map((t, i) => (
            <span
              key={t}
              style={{
                fontWeight: 700,
                fontSize: 14.5,
                color: i === 0 ? 'var(--ink)' : 'var(--muted)',
                borderBottom: i === 0 ? '2px solid var(--red)' : 'none',
                paddingBottom: 10,
                marginBottom: -13,
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="col gap-16">
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Название площадки</label>
            <input className="a-field" style={{ width: '100%' }} defaultValue="Avino — недвижимость Узбекистана" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Email поддержки</label>
            <input className="a-field" style={{ width: '100%' }} defaultValue="Support@avino.uz" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 7 }}>Авто-модерация</label>
            <select className="a-field" style={{ width: '100%' }}>
              <option>Выключена</option>
              <option>Для Avino Pro</option>
            </select>
          </div>
          <button className="abtn abtn-primary" style={{ alignSelf: 'flex-start' }}>Сохранить</button>
        </div>
      </div>
      <TelegramNotificationsToggle />
      <SmsSendingToggle />
      <PromotionsAvailabilityToggle />
      <ExchangeRatePanel />
    </div>
  );
}
