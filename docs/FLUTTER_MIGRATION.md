# Migração para Flutter + Pet vivo

## 0. Estado atual (feito no backend)

| Item | O que mudou |
|---|---|
| Fuso horário | "Hoje" agora é o dia local do `profile.timezone` (padrão `America/Sao_Paulo`) em dashboard, água e exercício. Antes era meia-noite UTC (o dia virava às 21h). Util: `src/common/utils/date.util.ts`. |
| XP | Uma só fonte de verdade: o servidor. Regras em `XP_RULES` (remédio 15 uma vez por dia por remédio, água 10 até 5 por dia, exercício 50, peso 10, uma vez por dia). Registro em `xp_events`. |
| Nível | `levelFromTotalXp`: o nível N custa `N × 100` XP para o próximo. `currentXp` é o XP total acumulado. |
| Sequência | Usa `last_active_date` (dia local), não mais `updatedAt`. Há `max_streak_days` e a sequência efetiva cai a 0 se passou mais de 1 dia sem hábito. |
| DNA do pet | Novos campos `pet_species` e `pet_dna` (JSON) no perfil, aceitos em `PATCH /profile`. |
| Login | A resposta do login agora traz `petName`, `petSpecies`, `petDna`, `dailyHydrationGoal` e `timezone`. |
| Guard | `GET /gamification/status` não tinha autenticação. Agora exige JWT. |

**Pendente antes de rodar:** aplicar a migration `20261026120000_pet_dna_xp_ledger` (`npx prisma migrate deploy` ou `migrate dev`). Ela ainda não foi aplicada em nenhum banco.

## 1. Contrato da API para o app novo

Todas as respostas vêm em `{ data: ... }`.

- `POST /auth/login | register | social-login` → `{ accessToken, refreshToken, user: { id, email, profile } }`
- `POST /auth/refresh` `{ refreshToken }` → mesmo formato do login. O refresh token é **de uso único** (rotação): guarde o novo a cada resposta. Token inválido, expirado, revogado ou já usado → `401`.
- `POST /auth/logout` `{ refreshToken }` → revoga a sessão (público, funciona com access token vencido).
- Sessão: access token curto (`JWT_EXPIRES_IN`, padrão 900 s) + refresh token opaco guardado só como hash (`REFRESH_TOKEN_TTL_DAYS`, padrão 30). Reaparecer um refresh token já usado indica replay e revoga a cadeia inteira; redefinir a senha revoga todas as sessões.
- `GET /gamification/status` → `{ totalXp, level, xpIntoLevel, nextLevelGoal, progressPercentage, streakDays, maxStreakDays, lastActiveDate }`
- `GET /dashboard/summary` → `{ hydration: {current}, exercise: {done}, profile }`
- `PATCH /profile` → `name, timezone, dailyHydrationGoal, petName, petSpecies, petDna`
- Remédios, água, exercício e peso: sem mudança de rota.

O app deve enviar o `timezone` do aparelho (ex.: `America/Sao_Paulo`) no primeiro acesso.

## 2. Mapa de stack

| Hoje (React Native) | Flutter |
|---|---|
| expo-router | `go_router` |
| zustand + react-query | `flutter_riverpod` (+ `AsyncNotifier`) |
| axios | `dio` (com interceptor de JWT) |
| expo-secure-store | `flutter_secure_storage` |
| async-storage | `shared_preferences` |
| nativewind + design-system | `ThemeData` + widgets próprios (`AppButton`, `AppCard`, `AppInput`, `Toast`) |
| gifted-charts | `fl_chart` |
| moti / reanimated | animações implícitas + `flutter_animate`; o pet usa `CustomPainter` |
| expo-auth-session | `google_sign_in`, `sign_in_with_apple` |
| expo-notifications | `flutter_local_notifications` |
| datetimepicker | `showTimePicker` / `showDatePicker` |

Estrutura sugerida: `lib/core` (api, storage, tema), `lib/features/{auth,dashboard,medications,hydration,exercise,weight,statistics,profile,onboarding,pet}`.

## 3. Fases e estimativa

Estimativas com margem de erro, para igualar o app atual (cerca de 6 mil linhas).

| Fase | Entrega | Tempo |
|---|---|---|
| A | Projeto, tema, componentes, cliente HTTP com JWT, roteamento | 2 a 3 dias |
| B | Login, cadastro, recuperação de senha, login social | 2 a 3 dias |
| C | Dashboard: remédios (lista, formulário, card), água, exercício, peso | 4 a 6 dias |
| D | Estatísticas e gráficos | 2 a 3 dias |
| E | Perfil e onboarding (com escolha de espécie e nome) | 1 a 2 dias |
| F | Testes em aparelho, ajustes de layout, builds Android (e iOS) | 2 a 4 dias |
| **Total** | **Paridade com o app de hoje** | **2 a 4 semanas** |
| G | Pet: renderizador por camadas (3 espécies), expressões, animações | 1 a 2 semanas |
| H | Motor de necessidades ligado aos registros | 3 a 5 dias |
| I | Refeições (backend + card), notificações do pet | 1 semana |
| J | Geração do DNA por IA no cadastro | 2 a 3 dias |

Observação: iPhone precisa de Mac ou serviço de build na nuvem (ex.: Codemagic). Android funciona direto no Windows.

## 4. Pet: especificação resumida

**DNA** (JSON salvo em `pet_dna`): `{ bodyType: 'blob'|'fish'|'tall', primaryColor, secondaryColor, pattern, earType, eyeType, accessory, seed }`. A `seed` varia detalhes sutis por pessoa.

**Camadas** no `CustomPainter`: corpo (por tipo) → peças da espécie → marcas → rosto (preso ao "ponto do rosto") → sobreposições de estado.

**Motor de necessidades** (função pura `computePetStatus(dados, agora)`):
- Saúde: doses vencidas por `timeOfDay`; esquecida = atrasada. `SKIPPED` não penaliza.
- Sede: água atual contra o esperado até agora (meta × fração do dia, 7h às 22h).
- Fome: refeições do dia (check-ins); dias sem comer deixam o corpo mais magro.
- Energia: exercício dos últimos 7 dias; descanso não penaliza no começo.
- Humor: o pior das necessidades, mais hora do dia (dorme das 23h às 6h).
- O pet nunca morre; o pior estado é "de cama".

## 5. Ordem de execução

1. Aplicar a migration e testar o backend (feito o código, falta aplicar).
2. Fases A a F (app Flutter com paridade).
3. Fases G e H (pet e necessidades).
4. Fases I e J.

## 6. Perguntas em aberto

- Existe projeto Flutter antigo para reaproveitar? (há uma migration chamada `add_flutter_ui_fields`)
- Plataformas-alvo: Android, iPhone, web?
- O app já está publicado com usuários reais? Isso afeta como migrar contas e dados.
