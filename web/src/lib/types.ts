// Shapes of the API responses (see docs/api.md). Amounts are always integer centavos.

export type User = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  status: 'password_pending' | 'username_pending' | 'active';
  isDemo: boolean;
};
export type Session = { user: User; authMethod: 'oauth' | 'password' };
export type Providers = {
  google: boolean;
  github: boolean;
  demo: { email: string; password: string };
};

export type Role = 'admin' | 'member';
export type Member = { userId: string; name: string; role: Role; status: 'active' | 'left' };
export type GroupListItem = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  netCentavos: number;
};
export type Group = { id: string; name: string; inviteCode: string; role: Role; members: Member[] };
export type InvitePreview = {
  groupId: string;
  name: string;
  memberCount: number;
  alreadyMember: boolean;
};

export type Balance = { userId: string; netCentavos: number };
export type Payment = { fromUser: string; toUser: string; amountCentavos: number };
export type Balances = { balances: Balance[]; payments: Payment[] };

export const CATEGORIES = [
  'rent',
  'utilities',
  'groceries',
  'food',
  'transport',
  'supplies',
  'fun',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];
export type SplitType = 'equal' | 'exact' | 'percent';

export type Expense = {
  id: string;
  description: string;
  amountCentavos: number;
  category: Category;
  splitType: SplitType;
  spentOn: string;
  paidBy: string;
  createdBy: string;
  createdAt: string;
  shares: { userId: string; shareCentavos: number }[];
};
export type SplitInput =
  | { type: 'equal'; participants: string[] }
  | { type: 'exact'; shares: { userId: string; amountCentavos: number }[] }
  | { type: 'percent'; shares: { userId: string; percent: number }[] };
export type ExpensePayload = Pick<
  Expense,
  'description' | 'amountCentavos' | 'category' | 'spentOn' | 'paidBy'
> & { split: SplitInput };

export type Settlement = {
  id: string;
  fromUser: string;
  toUser: string;
  createdBy: string;
  amountCentavos: number;
  settledOn: string;
};
export type ActivityEntry = {
  id: number;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
};
export type Summary = {
  byCategory: { category: Category; totalCentavos: number }[];
  byMonth: { month: string; totalCentavos: number }[];
};
export type Page<T> = { items: T[]; nextOffset: number | null };
