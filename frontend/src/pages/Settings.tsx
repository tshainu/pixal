import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Save, Building2, Hash, ShoppingBag, Printer, Globe, MessageCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';

type Tab = 'company' | 'numbering' | 'orders' | 'print' | 'locale' | 'messages';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'company',   label: 'Company Info',    icon: <Building2 size={14} /> },
  { id: 'numbering', label: 'Number Series',   icon: <Hash size={14} /> },
  { id: 'orders',    label: 'Order Settings',  icon: <ShoppingBag size={14} /> },
  { id: 'print',     label: 'Print / Display', icon: <Printer size={14} /> },
  { id: 'locale',    label: 'Currency & Locale', icon: <Globe size={14} /> },
  { id: 'messages',  label: 'Messages',        icon: <MessageCircle size={14} /> },
];

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--accent)' : '#CBD5E1',
          position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 22 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

// ── Variable pill ─────────────────────────────────────────────────────────────
const VARS: Record<string, { label: string; vars: { key: string; desc: string }[] }> = {
  order_confirmation: {
    label: 'Order Confirmation',
    vars: [
      { key: '{{customer_name}}', desc: 'Customer full name' },
      { key: '{{order_no}}', desc: 'Order number' },
      { key: '{{order_date}}', desc: 'Order date' },
      { key: '{{delivery_date}}', desc: 'Expected delivery date' },
      { key: '{{total_qty}}', desc: 'Total quantity' },
      { key: '{{total_amount}}', desc: 'Order total (LKR)' },
      { key: '{{company_name}}', desc: 'Your company name' },
    ],
  },
  order_ready: {
    label: 'Order Ready',
    vars: [
      { key: '{{customer_name}}', desc: 'Customer full name' },
      { key: '{{order_no}}', desc: 'Order number' },
      { key: '{{delivery_date}}', desc: 'Expected delivery date' },
      { key: '{{total_qty}}', desc: 'Total quantity' },
      { key: '{{company_name}}', desc: 'Your company name' },
      { key: '{{company_phone}}', desc: 'Your company phone' },
    ],
  },
  order_delivered: {
    label: 'Order Delivered',
    vars: [
      { key: '{{customer_name}}', desc: 'Customer full name' },
      { key: '{{order_no}}', desc: 'Order number' },
      { key: '{{invoice_no}}', desc: 'Invoice number' },
      { key: '{{total_amount}}', desc: 'Order total (LKR)' },
      { key: '{{company_name}}', desc: 'Your company name' },
    ],
  },
  payment_reminder: {
    label: 'Payment Reminder',
    vars: [
      { key: '{{customer_name}}', desc: 'Customer full name' },
      { key: '{{invoice_no}}', desc: 'Invoice number' },
      { key: '{{due_amount}}', desc: 'Amount due (LKR)' },
      { key: '{{company_name}}', desc: 'Your company name' },
      { key: '{{company_phone}}', desc: 'Your company phone' },
    ],
  },
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  order_confirmation: `Hello {{customer_name}},\n\nThank you for your order! 🎉\n\n*Order No:* {{order_no}}\n*Date:* {{order_date}}\n*Delivery Date:* {{delivery_date}}\n*Qty:* {{total_qty}} pcs\n*Total:* LKR {{total_amount}}\n\nWe will keep you updated on your order progress.\n\n{{company_name}}`,
  order_ready: `Hello {{customer_name}},\n\nGreat news! 🎊 Your order is ready for pickup/delivery.\n\n*Order No:* {{order_no}}\n*Qty:* {{total_qty}} pcs\n\nPlease contact us to arrange delivery.\n📞 {{company_phone}}\n\n{{company_name}}`,
  order_delivered: `Hello {{customer_name}},\n\nYour order *{{order_no}}* has been delivered. ✅\n\n*Invoice:* {{invoice_no}}\n*Amount:* LKR {{total_amount}}\n\nThank you for choosing {{company_name}}! We appreciate your business.`,
  payment_reminder: `Hello {{customer_name}},\n\nThis is a friendly reminder regarding your invoice *{{invoice_no}}*.\n\n*Amount Due:* LKR {{due_amount}}\n\nPlease contact us if you have any questions.\n📞 {{company_phone}}\n\n{{company_name}}`,
};

function TemplateEditor({
  tkey, form, set,
}: { tkey: string; form: Record<string, string>; set: (k: string, v: string) => void }) {
  const [open, setOpen] = useState(false);
  const info = VARS[tkey];
  const formKey = `msg_tpl_${tkey}`;
  const value = form[formKey] ?? DEFAULT_TEMPLATES[tkey] ?? '';

  const insertVar = (v: string) => {
    const ta = document.getElementById(`tpl-${tkey}`) as HTMLTextAreaElement | null;
    if (!ta) { set(formKey, value + v); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = value.slice(0, s) + v + value.slice(e);
    set(formKey, next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'var(--surface2, #F8FAFC)', border: 'none', cursor: 'pointer',
          fontWeight: 600, fontSize: '0.88rem',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: value !== DEFAULT_TEMPLATES[tkey] ? '#22C55E' : '#94A3B8',
            display: 'inline-block', flexShrink: 0,
          }} />
          {info.label}
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div style={{ padding: 16 }}>
          {/* Variable pills */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Insert Variable
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.vars.map(v => (
                <button
                  key={v.key}
                  type="button"
                  title={v.desc}
                  onClick={() => insertVar(v.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 500,
                    background: '#EEF2FF', color: 'var(--accent)', border: '1px solid #C7D2FE',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          <textarea
            id={`tpl-${tkey}`}
            className="form-control"
            rows={7}
            value={value}
            onChange={e => set(formKey, e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.6, resize: 'vertical' }}
          />

          <button
            type="button"
            style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => set(formKey, DEFAULT_TEMPLATES[tkey])}
          >
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}

function MessagesTab({ form, set, bool }: {
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  bool: (k: string, def?: boolean) => boolean;
}) {
  return (
    <div style={{ maxWidth: 680 }}>
      {/* WhatsApp Settings */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#25D366', color: '#fff' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
          </span>
          WhatsApp Settings
        </div>

        <Toggle
          label="Enable WhatsApp Messaging"
          desc="Send order notifications via WhatsApp"
          checked={bool('wa_enabled', false)}
          onChange={v => set('wa_enabled', String(v))}
        />

        {bool('wa_enabled', false) && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#15803D', marginBottom: 16, display: 'flex', gap: 8 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Uses WhatsApp Web link format (wa.me). Click the send button on any order to open WhatsApp with a pre-filled message. No API key required.</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Default Country Code</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <span style={{ padding: '0 10px', height: 38, display: 'flex', alignItems: 'center', background: '#F1F5F9', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: '0.85rem', color: 'var(--text2)' }}>+</span>
                  <input
                    className="form-control"
                    value={form.wa_country_code || '94'}
                    onChange={e => set('wa_country_code', e.target.value.replace(/\D/g, ''))}
                    placeholder="94"
                    style={{ maxWidth: 80, borderRadius: '0 6px 6px 0', borderLeft: 'none' }}
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>Sri Lanka = 94</div>
              </div>

              <div className="form-group">
                <label>Send Button Position</label>
                <select className="form-control" value={form.wa_btn_position || 'order_detail'} onChange={e => set('wa_btn_position', e.target.value)}>
                  <option value="order_detail">Order Detail only</option>
                  <option value="order_list">Order List + Detail</option>
                </select>
              </div>
            </div>

            {/* Auto-send on status change */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 4, background: '#25D36620', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>⚡</span>
                Auto-send on Status Change
              </div>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: '0.75rem', color: '#92400E', marginBottom: 12, display: 'flex', gap: 7 }}>
                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>When a status change triggers an auto-send, WhatsApp Web will open in a new tab with the pre-filled message. The customer's phone number must be saved on their profile.</span>
              </div>
              <Toggle
                label="Auto-send when status → Confirmed"
                desc="Opens WhatsApp with Order Confirmation message"
                checked={bool('wa_auto_confirmed', false)}
                onChange={v => set('wa_auto_confirmed', String(v))}
              />
              <Toggle
                label="Auto-send when status → Ready"
                desc="Opens WhatsApp with Order Ready message"
                checked={bool('wa_auto_ready', false)}
                onChange={v => set('wa_auto_ready', String(v))}
              />
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Cloud API */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: '#1877F2', color: '#fff', fontSize: 13 }}>API</span>
          WhatsApp Cloud API
        </div>

        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#1E40AF', marginBottom: 16, display: 'flex', gap: 8 }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Connect Meta WhatsApp Cloud API to send messages programmatically — no manual link opening.
            Requires a <strong>Meta Business Account</strong> with WhatsApp API access.{' '}
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" style={{ color: '#1D4ED8', fontWeight: 600 }}>Setup guide →</a>
          </span>
        </div>

        <Toggle
          label="Enable WhatsApp Cloud API"
          desc="Use Meta API to send messages instead of wa.me links"
          checked={bool('wa_api_enabled', false)}
          onChange={v => set('wa_api_enabled', String(v))}
        />

        {bool('wa_api_enabled', false) && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Phone Number ID <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                placeholder="e.g. 123456789012345"
                value={form.wa_api_phone_number_id || ''}
                onChange={e => set('wa_api_phone_number_id', e.target.value.trim())}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                Found in Meta Developer Console → WhatsApp → API Setup → Phone Number ID
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>Access Token <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                type="password"
                placeholder="EAAxxxxxxxxxx..."
                value={form.wa_api_access_token || ''}
                onChange={e => set('wa_api_access_token', e.target.value.trim())}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                Permanent system token from Meta Business → System Users. Do not use temporary tokens.
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label>API Version</label>
              <input
                className="form-control"
                placeholder="v19.0"
                value={form.wa_api_version || 'v19.0'}
                onChange={e => set('wa_api_version', e.target.value.trim())}
                style={{ maxWidth: 120 }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                Default: v19.0. Check Meta docs for latest stable version.
              </div>
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '10px 14px', fontSize: '0.76rem', color: '#166534', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ When API is enabled:</div>
              <div>• <strong>Order Confirmed</strong> → free-form message sent automatically via API</div>
              <div>• <strong>Order Ready</strong> → free-form message sent automatically via API</div>
              <div>• <strong>Payment Reminders</strong> → use approved WhatsApp templates</div>
              <div>• Manual send buttons still available on order detail</div>
            </div>

            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: '0.75rem', color: '#92400E', display: 'flex', gap: 8 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Free-form messages only work within a <strong>24-hour customer service window</strong> (customer messaged you first).
                For outbound reminders, use approved <strong>WhatsApp Template messages</strong> from your Meta Business account.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Message Templates */}
      <div className="card">
        <div className="card-title">Message Templates</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 18 }}>
          Customize the messages sent to customers for each event. Click a template to expand and edit. Use the variable pills to insert dynamic values.
        </div>

        {Object.keys(VARS).map(k => (
          <TemplateEditor key={k} tkey={k} form={form} set={set} />
        ))}

        {/* Auto Payment Reminder Config — shown only when WhatsApp is enabled */}
        {bool('wa_enabled', false) && (
          <div style={{
            marginTop: 8,
            border: '1px solid #C7D2FE',
            borderRadius: 10,
            background: '#F5F3FF',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 16px',
              background: '#EDE9FE',
              borderBottom: '1px solid #C7D2FE',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: 7, background: '#7C3AED', color: '#fff', fontSize: 13,
              }}>⏰</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4C1D95' }}>Auto Payment Reminders</div>
                <div style={{ fontSize: '0.72rem', color: '#6D28D9', marginTop: 1 }}>
                  Automatically flag overdue invoices for WhatsApp follow-up
                </div>
              </div>
            </div>

            <div style={{ padding: '16px' }}>
              {/* How it works info */}
              <div style={{
                background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 8,
                padding: '10px 14px', fontSize: '0.76rem', color: '#5B21B6',
                marginBottom: 16, display: 'flex', gap: 8, lineHeight: 1.5,
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  When enabled, the system tracks Delivered orders with <strong>Due</strong> or <strong>Partial</strong> payment.
                  Overdue reminders appear in the Orders page with a <strong>"Send Reminder"</strong> WhatsApp button.
                  Reminders auto-stop when payment is marked <strong>Paid</strong>.
                </span>
              </div>

              {/* Enable toggle */}
              <Toggle
                label="Enable Auto Payment Reminders"
                desc="Track unpaid Delivered orders and prompt WhatsApp reminders"
                checked={bool('wa_reminder_enabled', false)}
                onChange={v => set('wa_reminder_enabled', String(v))}
              />

              {bool('wa_reminder_enabled', false) && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Duration */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        Send reminders for up to
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <input
                          className="form-control"
                          type="number" min={1} max={365}
                          style={{ width: 90 }}
                          value={form.wa_reminder_duration_days || '60'}
                          onChange={e => set('wa_reminder_duration_days', e.target.value)}
                        />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text2)', whiteSpace: 'nowrap' }}>days after delivery</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                        Stop reminders after this many days regardless of payment status
                      </div>
                    </div>

                    {/* Interval */}
                    <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        Remind every
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <input
                          className="form-control"
                          type="number" min={1} max={90}
                          style={{ width: 90 }}
                          value={form.wa_reminder_interval_days || '7'}
                          onChange={e => set('wa_reminder_interval_days', e.target.value)}
                        />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text2)', whiteSpace: 'nowrap' }}>days</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>
                        Minimum gap between reminder prompts for the same invoice
                      </div>
                    </div>
                  </div>

                  {/* Summary pill */}
                  <div style={{
                    background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8,
                    padding: '10px 14px', fontSize: '0.78rem', color: '#5B21B6',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <span>
                      Reminders will appear every <strong>{form.wa_reminder_interval_days || 7} days</strong> for up to{' '}
                      <strong>{form.wa_reminder_duration_days || 60} days</strong> after delivery.
                      Auto-stops when payment is received.
                    </span>
                  </div>

                  {/* Auto-stop note */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.75rem', color: '#059669',
                    background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 7, padding: '8px 12px',
                  }}>
                    <span>✅</span>
                    <span>
                      <strong>Auto-stops</strong> when the invoice payment status is set to <strong>Paid</strong>
                    </span>
                  </div>

                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('company');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });

  useEffect(() => {
    if (data) setForm(data as Record<string, string>);
  }, [data]);

  const save = useMutation({
    mutationFn: (d: object) => api.updateSettings(d),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setForm(res.settings || res);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));
  const bool = (key: string, def = true) => (form[key] ?? String(def)) !== 'false';

  if (isLoading) return <div className="loading">Loading settings…</div>;

  return (
    <div>
      <div className="topbar">
        <h2>Settings</h2>
        <div className="topbar-right">
          <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(form)}>
            <Save size={14} /> {save.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="content">
        {saved && (
          <div className="alert alert-success" style={{ marginBottom: 20 }}>
            Settings saved successfully
          </div>
        )}

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Company Info ── */}
        {tab === 'company' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-title">Company Information</div>

            {/* Logo Upload */}
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Company Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 88, height: 88, borderRadius: 12,
                  border: '2px dashed var(--border)',
                  background: '#FAFAFA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0, position: 'relative',
                }}>
                  {form.company_logo
                    ? <img src={form.company_logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <Building2 size={28} style={{ color: 'var(--text3)' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 8 }}>
                    Appears in the sidebar and on printed documents. PNG or JPG, square recommended.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label style={{
                      padding: '6px 14px', background: 'var(--accent, #6366f1)', color: '#fff',
                      borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                    }}>
                      Upload Logo
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const max = 240;
                            let w = img.width, h = img.height;
                            if (w > max || h > max) { const r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
                            canvas.width = w; canvas.height = h;
                            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                            set('company_logo', canvas.toDataURL('image/png'));
                          };
                          img.src = ev.target?.result as string;
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }} />
                    </label>
                    {form.company_logo && (
                      <button type="button" className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => set('company_logo', '')}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Company Name</label>
                <input className="form-control" value={form.name || ''} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input className="form-control" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className="form-control" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Address</label>
              <textarea className="form-control" rows={3} value={form.address || ''} onChange={e => set('address', e.target.value)} />
            </div>
          </div>
        )}

        {/* ── Number Series ── */}
        {tab === 'numbering' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-title">Document Number Series</div>
            <div style={{ background: '#FFFDE7', border: '1px solid #FFC107', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', marginBottom: 20, color: '#795548' }}>
              Changing prefix applies to new documents only. Sequence changes take effect immediately.
            </div>
            {[
              { key: 'order_prefix',     seq: 'order_seq',     label: 'Orders' },
              { key: 'invoice_prefix',   seq: 'invoice_seq',   label: 'Invoices' },
              { key: 'quotation_prefix', seq: 'quotation_seq', label: 'Quotations' },
            ].map(({ key, seq, label }) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 16, alignItems: 'end', marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, paddingBottom: 8 }}>{label}</div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Prefix</label>
                  <input className="form-control" value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder="e.g. ORD-" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Next Sequence</label>
                  <input className="form-control" type="number" min={1} value={form[seq] || 1} onChange={e => set(seq, e.target.value)} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 10, padding: '12px 16px', background: '#FAFAFA', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text3)' }}>
              <strong>Preview:</strong>{' '}
              {(form.order_prefix || 'ORD-')}{String(form.order_seq || 1).padStart(4, '0')},{' '}
              {(form.invoice_prefix || 'INV-')}{String(form.invoice_seq || 1).padStart(4, '0')},{' '}
              {(form.quotation_prefix || 'QT-')}{String(form.quotation_seq || 1).padStart(4, '0')}
            </div>
          </div>
        )}

        {/* ── Order Settings ── */}
        {tab === 'orders' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-title">Order Settings</div>

            <div className="form-group">
              <label>Default Order Status (for new orders)</label>
              <select className="form-control" value={form.default_order_status || 'New'} onChange={e => set('default_order_status', e.target.value)}>
                {['New', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Production Calendar — Daily Capacity</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  className="form-control"
                  type="number" min={1} max={10000}
                  style={{ width: 120 }}
                  value={form.cal_capacity || 500}
                  onChange={e => set('cal_capacity', e.target.value)}
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>units / day</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: 4 }}>
                Used in the production calendar to show daily load vs capacity
              </div>
            </div>
          </div>
        )}

        {/* ── Print / Display ── */}
        {tab === 'print' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-title">Print & Display Options</div>

            <div className="form-group" style={{ marginBottom: 24 }}>
              <label>Paper Size</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {['A4', 'A5', 'Letter'].map(sz => (
                  <label key={sz} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
                    border: `2px solid ${(form.print_paper_size || 'A4') === sz ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                    background: (form.print_paper_size || 'A4') === sz ? 'var(--accent-light, #EEF2FF)' : 'transparent',
                    color: (form.print_paper_size || 'A4') === sz ? 'var(--accent)' : 'inherit',
                  }}>
                    <input type="radio" style={{ display: 'none' }} checked={(form.print_paper_size || 'A4') === sz} onChange={() => set('print_paper_size', sz)} />
                    {sz}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Print Sheet Visibility
              </div>
              <Toggle
                label="Show Design Images"
                desc="Print the uploaded design/style image on order sheets"
                checked={bool('print_show_images', true)}
                onChange={v => set('print_show_images', String(v))}
              />
              <Toggle
                label="Show Elements / Materials"
                desc="Print fabric, thread, and accessory breakdown"
                checked={bool('print_show_elements', true)}
                onChange={v => set('print_show_elements', String(v))}
              />
              <Toggle
                label="Show Sizes Table"
                desc="Print the size quantity breakdown table"
                checked={bool('print_show_sizes', true)}
                onChange={v => set('print_show_sizes', String(v))}
              />
            </div>
          </div>
        )}

        {/* ── Messages & Templates ── */}
        {tab === 'messages' && <MessagesTab form={form} set={set} bool={bool} />}

        {/* ── Currency & Locale ── */}
        {tab === 'locale' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-title">Currency & Locale</div>

            <div className="form-row">
              <div className="form-group">
                <label>Currency Symbol</label>
                <input
                  className="form-control"
                  value={form.currency_symbol || 'LKR'}
                  onChange={e => set('currency_symbol', e.target.value)}
                  placeholder="LKR"
                  style={{ maxWidth: 100 }}
                />
              </div>
              <div className="form-group">
                <label>Date Format</label>
                <select className="form-control" value={form.date_format || 'DD/MM/YYYY'} onChange={e => set('date_format', e.target.value)}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 14/06/2026)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 06/14/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-06-14)</option>
                  <option value="DD MMM YYYY">DD MMM YYYY (e.g. 14 Jun 2026)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text2)' }}>
              <strong>Preview:</strong>{' '}
              {form.currency_symbol || 'LKR'} 12,500.00 &nbsp;·&nbsp; {
                (form.date_format || 'DD/MM/YYYY') === 'DD/MM/YYYY' ? '14/06/2026' :
                (form.date_format || 'DD/MM/YYYY') === 'MM/DD/YYYY' ? '06/14/2026' :
                (form.date_format || 'DD/MM/YYYY') === 'YYYY-MM-DD' ? '2026-06-14' : '14 Jun 2026'
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
