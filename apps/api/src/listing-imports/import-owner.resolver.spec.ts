import { CreateListingDto } from '../listings/dto/create-listing.dto';
import { ownerError, OwnerLookup } from './import-owner.resolver';
import { ImportRowInput } from './import-row.validator';

const input = (firstName: string | null, lastName: string | null): ImportRowInput => ({
  phone: '+998901234567',
  firstName,
  lastName,
  dto: {} as CreateListingDto,
  photos: [],
});

describe('ownerError', () => {
  it('заблокированный владелец', () => {
    expect(ownerError({ kind: 'BLOCKED' }, input('А', 'Б'))).toMatchObject({
      column: 'phone',
      code: 'OWNER_BLOCKED',
    });
  });

  it('новый владелец без имени или фамилии', () => {
    expect(ownerError({ kind: 'NEW' }, input('А', null))).toMatchObject({
      column: 'last_name',
      code: 'OWNER_NAME_REQUIRED',
    });
    expect(ownerError({ kind: 'NEW' }, input(null, 'Б'))).toMatchObject({
      column: 'first_name',
      code: 'OWNER_NAME_REQUIRED',
    });
    expect(ownerError({ kind: 'NEW' }, input('А', 'Б'))).toBeNull();
  });

  it('существующий: имя берётся из профиля или из файла', () => {
    const full: OwnerLookup = { kind: 'EXISTING', userId: 'u', firstName: 'А', lastName: 'Б' };
    const empty: OwnerLookup = { kind: 'EXISTING', userId: 'u', firstName: null, lastName: '  ' };
    expect(ownerError(full, input(null, null))).toBeNull();
    expect(ownerError(empty, input('А', 'Б'))).toBeNull();
    expect(ownerError(empty, input('А', null))).toMatchObject({
      column: 'last_name',
      code: 'OWNER_NAME_REQUIRED',
    });
  });
});
