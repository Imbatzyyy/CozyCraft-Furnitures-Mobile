import { nativeNotificationId } from './notification-handoff';
describe('notification cold-start handoff', () => {
  it('accepts only a safe database identifier, never a push URL', () => {
    expect(nativeNotificationId({ notificationId: 42 })).toBe('42');
    expect(nativeNotificationId({ notificationId: '42' })).toBe('42');
    for (const value of [null, {}, { notificationId: -1 }, { notificationId: 'https://example.test' }, { notificationId: '9999999999999999' }]) expect(nativeNotificationId(value)).toBe('');
  });
});
