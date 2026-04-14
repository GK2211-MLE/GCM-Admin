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
import { Building2, ShoppingCart, Bell, Truck, Save, Percent } from 'lucide-react';

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
      </div>
    </div>
  );
}
