import { storefrontCanUpdate } from './update-policy';

describe('Safe update activation', () => {
  let doc: Document;
  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Storefront');
    Object.defineProperty(doc, 'hidden', { value: false, configurable: true });
    doc.body.innerHTML = '<main data-cozy-update-safe="true"><button>Shop</button></main>';
    doc.documentElement.dataset['cozyUpdateRequests'] = '0';
    doc.documentElement.dataset['cozyUpdateInteraction'] = String(Date.now() - 4000);
  });
  it('allows only an idle rendered storefront', () => {
    expect(storefrontCanUpdate(doc, true, true)).toBeTrue();
    expect(storefrontCanUpdate(null, true, true)).toBeFalse();
  });
  it('blocks native payments, callbacks and background activation', () => {
    expect(storefrontCanUpdate(doc, false, true)).toBeFalse();
    expect(storefrontCanUpdate(doc, true, false)).toBeFalse();
  });
  it('blocks onboarding, checkout and account edits', () => {
    doc.querySelector('main')!.setAttribute('data-cozy-update-safe', 'false');
    expect(storefrontCanUpdate(doc, true, true)).toBeFalse();
    doc.querySelector('main')!.setAttribute('data-cozy-update-safe', 'true');
    doc.body.innerHTML += '<section data-cozy-update-busy="true"></section>';
    expect(storefrontCanUpdate(doc, true, true)).toBeFalse();
  });
  it('blocks dialogs, request activity, recent input and recovery errors', () => {
    for (const html of ['<div role="dialog"></div>', '<div aria-modal="true"></div>', '<div class="mobile-recovery-screen"></div>']) {
      const div = doc.createElement('div'); div.innerHTML = html; doc.body.append(div);
      expect(storefrontCanUpdate(doc, true, true)).toBeFalse(); div.remove();
    }
    doc.documentElement.dataset['cozyUpdateRequests'] = '1';
    expect(storefrontCanUpdate(doc, true, true)).toBeFalse();
    doc.documentElement.dataset['cozyUpdateRequests'] = '0';
    doc.documentElement.dataset['cozyUpdateInteraction'] = String(Date.now());
    expect(storefrontCanUpdate(doc, true, true)).toBeFalse();
  });
});
