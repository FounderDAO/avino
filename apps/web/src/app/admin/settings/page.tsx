/**
 * Настройки — живые тумблеры/панели конфигурации платформы (server-компонент).
 * Декоративная форма прототипа (название/email/авто-модерация + фейковые табы
 * Общие/Районы/Роли/Интеграции) удалена: у неё не было ни бэкенда, ни
 * обработчиков — только вводящий в заблуждение «Сохранить».
 */
import { SectionTitle } from '@/components/admin/ui/section-title';
import { TelegramNotificationsToggle } from '@/components/admin/TelegramNotificationsToggle';
import { SmsSendingToggle } from '@/components/admin/SmsSendingToggle';
import { PromotionsAvailabilityToggle } from '@/components/admin/PromotionsAvailabilityToggle';
import { ActiveListingLimitControl } from '@/components/admin/ActiveListingLimitControl';
import { MapHoverRecenterToggle } from '@/components/admin/MapHoverRecenterToggle';
import { LegalConsentRequiredToggle } from '@/components/admin/LegalConsentRequiredToggle';
import { ExchangeRatePanel } from '@/components/admin/ExchangeRatePanel';
import { NotificationsSendingToggle } from '@/components/admin/NotificationsSendingToggle';

export default function SettingsPage() {
  return (
    <div>
      <SectionTitle sub="Конфигурация платформы">Настройки</SectionTitle>
      <TelegramNotificationsToggle />
      <SmsSendingToggle />
      <NotificationsSendingToggle />
      <PromotionsAvailabilityToggle />
      <ActiveListingLimitControl />
      <MapHoverRecenterToggle />
      <LegalConsentRequiredToggle />
      <ExchangeRatePanel />
    </div>
  );
}
