# Design System

Source of truth: [constants/theme.ts](../../../constants/theme.ts)

## Color Palette

All colors are dark-mode only (`userInterfaceStyle: "dark"` in app.json — no light mode).

```
Primary:     #FF6B00   Orange — CTAs, active states, primary highlights
Accent:      #FFD166   Gold — rewards, milestones, XP
Success:     #06D6A0   Teal — positive outcomes, savings rate, completed states
Warning:     #FFB547   Amber — EMI, loans, caution states
Error:       #FF5A5A   Red — errors, negative deltas

Background:  #0D0D0D   Deep dark — screen backgrounds
Surface:     #1A1208   Dark brown — card backgrounds
SurfaceHigh: #251A0A   Slightly lighter surface — nested cards
Border:      #3D2A10   Brown tint — card borders, dividers

TextPrimary:   #FFFFFF
TextSecondary: #C4A882   Warm off-white — secondary labels
TextMuted:     #7A6040   Dim brown — hints, placeholders

GradientStart: #FF6B00   → used in GradientButton, hero sections
GradientEnd:   #FFD166
```

## Category Colors
Used in spending breakdown charts and category badges:
```
food:          #FF6584   Pink
transport:     #6C63FF   Purple
shopping:      #FFB547   Amber
health:        #43D9AD   Teal
entertainment: #FF9F43   Orange
utilities:     #A0A3BD   Slate
other:         #5A5880   Purple-gray
```

## Spacing Scale
```
xs:  4px
sm:  8px
md:  16px
lg:  24px
xl:  32px
xxl: 48px
```

## Border Radius
```
sm:   8px
md:   12px
lg:   16px
xl:   24px
full: 9999px   (pill / avatar)
```

## Typography
Font family: System default (no custom font in v1).

### Sizes
```
xs:   11px   — micro labels, badge text
sm:   13px   — secondary body, captions
base: 15px   — primary body text
md:   17px   — emphasized body, list items
lg:   20px   — section headings
xl:   24px   — card titles
xxl:  30px   — hero numbers (corpus, retire age)
xxxl: 38px   — splash / celebration numbers
```

### Weights
```
regular:   400
medium:    500
semiBold:  600
bold:      700
extraBold: 800
```

## Icons
Library: `@expo/vector-icons` → `Ionicons`
- Outlined variant (`-outline` suffix) for default/inactive states
- Solid variant (no suffix) for active/selected states

Common icons:
```
wallet-outline       — net worth, savings
trending-up-outline  — growth, savings rate
cash-outline         — income, EMI-free state
flame / flame-outline — Freedom Days
diamond-outline      — corpus, FIRE number
flash-outline        — XP, quests
medal-outline        — level 50 badge
```

## Component Inventory

### Layout
| Component | File | Props |
|-----------|------|-------|
| `Card` | `components/ui/Card.tsx` | `children`, `style?`, `elevated?` |
| `GradientBackground` | `components/ui/GradientBackground.tsx` | `children`, `style?` |

### Inputs
| Component | File | Props |
|-----------|------|-------|
| `InputField` | `components/ui/InputField.tsx` | `label`, `value`, `onChangeText`, `icon?`, `error?`, `secureTextEntry?`, `keyboardType?` |
| `SliderInput` | `components/ui/SliderInput.tsx` | `label`, `value`, `onValueChange`, `min`, `max`, `step`, `unit?` |

### Buttons
| Component | File | Props |
|-----------|------|-------|
| `GradientButton` | `components/ui/GradientButton.tsx` | `title`, `onPress`, `variant: 'solid'\|'outline'`, `disabled?`, `loading?` |

### Progress
| Component | File | Props |
|-----------|------|-------|
| `ProgressRing` | `components/ui/ProgressRing.tsx` | `progress` (0–1), `size`, `color`, `children?` |
| `XPBar` | `components/ui/XPBar.tsx` | `xp`, `level`, `title`, `icon`, `color` |
| `MilestoneBar` | `components/ui/MilestoneBar.tsx` | `milestones[]`, `currentValue` |

### Gamification
| Component | File | Props |
|-----------|------|-------|
| `BadgeCard` | `components/ui/BadgeCard.tsx` | `badge: BadgeDefinition`, `unlocked: boolean`, `unlockedAt?: string` |
| `QuestCard` | `components/ui/QuestCard.tsx` | `quest: QuestDefinition`, `userQuest: UserQuest` |
| `FreedomDaysCard` | `components/ui/FreedomDaysCard.tsx` | `totalDays`, `recentlyEarned?` |
| `TaskCard` | `components/ui/TaskCard.tsx` | `task: UserTask`, `onAccept`, `onCancel`, `onComplete` |
| `TopBar` | `components/ui/TopBar.tsx` | `level`, `xp`, `name` |

### Modals & Toasts
| Component | File | Trigger |
|-----------|------|---------|
| `LevelUpModal` | `components/ui/LevelUpModal.tsx` | Level increases |
| `BadgeUnlockModal` | `components/ui/BadgeUnlockModal.tsx` | New badge condition met |
| `XPCelebrationModal` | `components/ui/XPCelebrationModal.tsx` | Any XP-earning action |
| `TaskCompleteModal` | `components/ui/TaskCompleteModal.tsx` | Task marked done |
| `StreakMilestoneModal` | `components/ui/StreakMilestoneModal.tsx` | Streak hits 7/30/100 |
| `RewardToast` | `components/ui/RewardToast.tsx` | Lightweight XP + freedom days toast |
| `ConfettiBurst` | `components/ui/ConfettiBurst.tsx` | Triggered by all celebrations |

## Animation Conventions
- **Spring animations** for celebration entrances (scale up, bounce)
- **Timing animations** for card reveals and tab transitions (ease-out, 300ms)
- **Looping animations** for onboarding floating icons (translate Y, infinite)
- Library: `react-native-reanimated` v4 (worklets, not JS thread)

## Layout Conventions
- Primary layout: vertical `ScrollView` with `RefreshControl`
- Sub-navigation: horizontal `ScrollView` of pill buttons (not native tabs)
- Cards: `BorderRadius.md` (12px), `Surface` background, `Border` color border
- Hero numbers: `FontSize.xxl`–`xxxl`, `FontWeight.bold`–`extraBold`, `textPrimary`
- Section headers: `FontSize.sm`, `FontWeight.semiBold`, `textMuted`, UPPERCASE
- Empty states: centered icon + title + subtitle, optional CTA button
