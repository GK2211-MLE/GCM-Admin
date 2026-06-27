import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/feedback/LoadingSpinner';
import { Building2, ShoppingCart, Bell, Truck, Save, Percent, ExternalLink, CreditCard } from 'lucide-react';

interface TenantConfig {
  contactEmail: string;
  contactPhone: string;
  minOrderAmount: number;
  freeDeliveryThreshold: number;
  defaultDeliveryFee: number;
  taxLabel: string;
  taxRegistrationNumber: string;
  taxInclusivePricing: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  whatsappNotifications: boolean;
  deliveryRadius: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}

interface TenantSettings {
  name: string;
  taxRate: number;
  timezone: string;
  currency: string;
  config: TenantConfig;
}

const DEFAULT_CONFIG: TenantConfig = {
  contactEmail: '',
  contactPhone: '',
  minOrderAmount: 0,
  freeDeliveryThreshold: 10000,
  defaultDeliveryFee: 999,
  taxLabel: 'Sales Tax',
  taxRegistrationNumber: '',
  taxInclusivePricing: false,
  emailNotifications: true,
  smsNotifications: false,
  whatsappNotifications: false,
  deliveryRadius: 25,
  pickupEnabled: true,
  deliveryEnabled: false,
};

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
];

const TIMEZONES = [
  { value: 'America/Chicago', label: 'America/Chicago (CST)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'America/Denver', label: 'America/Denver (MST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
];

function SectionIcon({ icon: Icon, color }: { icon: typeof Building2; color: string }) {
  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
      <Icon className="h-5 w-5 text-white" />
    </div>
  );
}

function SuccessMessage({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-sm text-success">Settings saved successfully!</p>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
      {children}
    </label>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {description && (
          <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function GeneralPage() {
  const queryClient = useQueryClient();

  // -- General Settings state --
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [timezone, setTimezone] = useState('America/Chicago');

  // -- Order Settings state (stored in dollars for the UI; converted to
  // cents on save and back to dollars on load) --
  const [minOrderAmount, setMinOrderAmount] = useState('0.00');
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState('100.00');
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState('9.99');

  // -- Tax Settings state --
  const [taxRate, setTaxRate] = useState('0');
  const [taxLabel, setTaxLabel] = useState('Sales Tax');
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState('');
  const [taxInclusivePricing, setTaxInclusivePricing] = useState(false);

  // -- Notification Settings state --
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [whatsappNotifications, setWhatsappNotifications] = useState(false);

  // -- Delivery Settings state --
  const [deliveryRadius, setDeliveryRadius] = useState('25');
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);

  // -- Success / saving flags per section --
  const [successSection, setSuccessSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.settings.general(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ settings: TenantSettings }>('/settings');
      return data.settings;
    },
  });

  useEffect(() => {
    if (!data) return;
    const config = { ...DEFAULT_CONFIG, ...data.config };

    setName(data.name ?? '');
    setCurrency(data.currency ?? 'USD');
    setTimezone(data.timezone ?? 'America/Chicago');
    setTaxRate(String(((data.taxRate ?? 0) * 100).toFixed(2)));

    setContactEmail(config.contactEmail);
    setContactPhone(config.contactPhone);
    // Money fields are stored in cents in the backend (customer endpoint
    // divides by 100 on read). Display as dollars in the admin UI so the
    // "($)" label matches what the admin actually types.
    setMinOrderAmount((config.minOrderAmount / 100).toFixed(2));
    setFreeDeliveryThreshold((config.freeDeliveryThreshold / 100).toFixed(2));
    setDefaultDeliveryFee((config.defaultDeliveryFee / 100).toFixed(2));
    setTaxLabel(config.taxLabel);
    setTaxRegistrationNumber(config.taxRegistrationNumber);
    setTaxInclusivePricing(config.taxInclusivePricing);
    setEmailNotifications(config.emailNotifications);
    setSmsNotifications(config.smsNotifications);
    setWhatsappNotifications(config.whatsappNotifications);
    setDeliveryRadius(String(config.deliveryRadius));
    setPickupEnabled(config.pickupEnabled);
    setDeliveryEnabled(config.deliveryEnabled);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<TenantSettings>) => {
      await apiClient.put('/settings', payload);
    },
    onSuccess: (_data, _variables, _context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.general() });
    },
  });

  function buildConfig(): TenantConfig {
    return {
      contactEmail,
      contactPhone,
      // Admin types in dollars; backend stores cents. Round to avoid
      // floating-point crumbs (e.g. 5.99 → 599, not 598.9999).
      minOrderAmount: Math.round((parseFloat(minOrderAmount) || 0) * 100),
      freeDeliveryThreshold: Math.round((parseFloat(freeDeliveryThreshold) || 0) * 100),
      defaultDeliveryFee: Math.round((parseFloat(defaultDeliveryFee) || 0) * 100),
      taxLabel,
      taxRegistrationNumber,
      taxInclusivePricing,
      emailNotifications,
      smsNotifications,
      whatsappNotifications,
      deliveryRadius: parseFloat(deliveryRadius) || 0,
      pickupEnabled,
      deliveryEnabled,
    };
  }

  function saveSection(section: string) {
    setSuccessSection(null);
    setSavingSection(section);
    saveMutation.mutate(
      {
        name,
        taxRate: (parseFloat(taxRate) || 0) / 100,
        timezone,
        currency,
        config: buildConfig(),
      },
      {
        onSuccess: () => {
          setSavingSection(null);
          setSuccessSection(section);
          toast.success(`${section} settings saved`);
          setTimeout(() => setSuccessSection(null), 3000);
        },
        onError: () => {
          setSavingSection(null);
          // Global axios interceptor already shows the error toast
        },
      },
    );
  }

  if (isLoading) return <LoadingSpinner className="h-64" />;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your business configuration and preferences" />

      <div className="space-y-6 max-w-2xl">
        {/* Section 1: General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={Building2} color="bg-blue-600" />
              <CardTitle>General Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <FieldLabel>Business Name *</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Farm2Cook"
                  required
                />
              </div>
              <div>
                <FieldLabel>Contact Email</FieldLabel>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="hello@farm2cook.com"
                />
              </div>
              <div>
                <FieldLabel>Contact Phone</FieldLabel>
                <Input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Currency</FieldLabel>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Timezone</FieldLabel>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveSection('general')}
                  disabled={savingSection === 'general' || !name.trim()}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingSection === 'general' ? 'Saving...' : 'Save Changes'}
                </Button>
                <SuccessMessage show={successSection === 'general'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Order Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={ShoppingCart} color="bg-amber-600" />
              <CardTitle>Order Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <FieldLabel>Minimum Order Amount ($)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <FieldLabel>Free Delivery Threshold ($)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={freeDeliveryThreshold}
                  onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
                  placeholder="100.00"
                />
              </div>
              <div>
                <FieldLabel>Default Delivery Fee ($)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultDeliveryFee}
                  onChange={(e) => setDefaultDeliveryFee(e.target.value)}
                  placeholder="9.99"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveSection('order')}
                  disabled={savingSection === 'order'}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingSection === 'order' ? 'Saving...' : 'Save Changes'}
                </Button>
                <SuccessMessage show={successSection === 'order'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Tax Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={Percent} color="bg-emerald-600" />
              <CardTitle>Tax Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Tax Rate (%)</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    placeholder="5.00"
                  />
                </div>
                <div>
                  <FieldLabel>Tax Label</FieldLabel>
                  <Input
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                    placeholder="Sales Tax"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Tax Registration Number (GST No. / Tax ID)</FieldLabel>
                <Input
                  value={taxRegistrationNumber}
                  onChange={(e) => setTaxRegistrationNumber(e.target.value)}
                  placeholder="e.g. GSTIN 29ABCDE1234F1Z5"
                />
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Your GST/Tax identification number for invoices.
                </p>
              </div>
              <SwitchRow
                label="Tax Inclusive Pricing"
                description="Prices shown to customers already include tax"
                checked={taxInclusivePricing}
                onCheckedChange={setTaxInclusivePricing}
              />
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveSection('tax')}
                  disabled={savingSection === 'tax'}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingSection === 'tax' ? 'Saving...' : 'Save Changes'}
                </Button>
                <SuccessMessage show={successSection === 'tax'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Notification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={Bell} color="bg-violet-600" />
              <CardTitle>Notification Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <SwitchRow
                label="Email Notifications"
                description="Send order updates and alerts via email"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
              <SwitchRow
                label="SMS Notifications"
                description="Send order updates via text messages"
                checked={smsNotifications}
                onCheckedChange={setSmsNotifications}
              />
              <SwitchRow
                label="WhatsApp Notifications"
                description="Send order updates via WhatsApp"
                checked={whatsappNotifications}
                onCheckedChange={setWhatsappNotifications}
              />
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveSection('notifications')}
                  disabled={savingSection === 'notifications'}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingSection === 'notifications' ? 'Saving...' : 'Save Changes'}
                </Button>
                <SuccessMessage show={successSection === 'notifications'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Delivery Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <SectionIcon icon={Truck} color="bg-rose-600" />
              <CardTitle>Delivery Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <FieldLabel>Delivery Radius (miles)</FieldLabel>
                <Input
                  type="number"
                  min="0"
                  value={deliveryRadius}
                  onChange={(e) => setDeliveryRadius(e.target.value)}
                  placeholder="25"
                />
              </div>
              <SwitchRow
                label="Pickup Enabled"
                description="Allow customers to pick up orders in person"
                checked={pickupEnabled}
                onCheckedChange={setPickupEnabled}
              />
              <SwitchRow
                label="Delivery Enabled"
                description="Offer delivery to customer addresses"
                checked={deliveryEnabled}
                onCheckedChange={setDeliveryEnabled}
              />
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => saveSection('delivery')}
                  disabled={savingSection === 'delivery'}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {savingSection === 'delivery' ? 'Saving...' : 'Save Changes'}
                </Button>
                <SuccessMessage show={successSection === 'delivery'} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 6: Payments — quick link to the merchant's Stripe
            dashboard. Stripe handles the actual payouts and bank
            account configuration outside this app, so the cleanest
            "configure payouts" UX is just a button that takes the
            owner to Stripe directly. */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary-500" />
              <CardTitle>Payments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Card payments are processed by Stripe. Your bank account, payout
                schedule and tax forms live in the Stripe Dashboard, not here.
              </p>
              <a
                href="https://dashboard.stripe.com/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#635bff] hover:bg-[#5851e5] px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M13.479 9.883c-1.626-.604-2.512-1.078-2.512-1.794 0-.603.493-.95 1.378-.95 1.626 0 3.302.625 4.451 1.197l.65-4.013C16.532 3.806 14.764 3.4 12.704 3.4c-1.418 0-2.6.371-3.443 1.063-.876.731-1.331 1.787-1.331 3.063 0 2.314 1.413 3.302 3.728 4.137 1.49.534 1.99.917 1.99 1.5 0 .566-.484.892-1.357.892-1.073 0-2.835-.524-3.99-1.21l-.66 4.06c.99.561 2.821 1.137 4.722 1.137 1.5 0 2.752-.354 3.594-1.025.94-.747 1.43-1.85 1.43-3.176 0-2.367-1.448-3.355-3.908-4.258z" />
                </svg>
                Open Stripe Dashboard
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </a>
              <p className="text-xs text-[var(--text-tertiary)]">
                Tip: log in with the same email you used when connecting Stripe
                to Farm2Cook.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
