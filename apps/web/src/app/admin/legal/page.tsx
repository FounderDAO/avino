import { SectionTitle } from '@/components/admin/ui/section-title';
import { LegalDocumentsManager } from '@/components/admin/legal/LegalDocumentsManager';

export default function AdminLegalPage() {
  return (
    <div>
      <SectionTitle sub="Правила сервиса и Политика конфиденциальности — версии и публикация">
        Юр-документы
      </SectionTitle>
      <LegalDocumentsManager />
    </div>
  );
}
