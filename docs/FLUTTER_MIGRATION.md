# App Flutter + Pet vivo: estado e contrato

O app Flutter (repositório `health_flutter`, local) substituiu o app React Native. Este backend é o mesmo NestJS; o que mudou está resumido abaixo. Todas as respostas vêm em `{ data: ... }`; erros vêm como `{ statusCode, error, code?, details? }` (`error` é a mensagem pronta para mostrar).

## 1. Regras de produto (valem para o servidor e para o app)

- **XP é constância.** Há uma meta do dia montada a partir dos módulos que a pessoa escolheu acompanhar (remédios, água, exercício, refeições; peso não conta como tarefa). Teto de 150 XP por dia. A sequência conta o dia que bateu o mínimo; um dia de descanso protege a sequência. **Nunca há XP por resultado de peso.**
- **Moedas vêm de metas cumpridas**, nunca de velocidade ou exagero. Ficam num livro-razão (`coin_events`, idempotente por `profileId + reason + refId`). Só compram **enfeites**: cabelo, roupa, pele (cor da pelagem) e cenário. O corpo do pet não é vendido e moedas não são perdidas.
- **Peso e piso de saúde.** Meta de peso abaixo do piso (IMC 18,5, ajustável de 16 a 22) exige confirmação e a recompensa para no piso. O objetivo muda o sentido da meta (em recuperação, ganhar peso é cumprir).
- **O pet tem 3 camadas:** identidade (DNA), corpo (volume × músculo, vindos da tendência lenta do peso e dos treinos; desligável no modo "só hábitos") e vitalidade (vinda dos hábitos). Abaixo do piso o pet aparece "frágil", nunca "mais bonito", com um aviso gentil.
- Módulos são opcionais. Conta antiga (sem "Sobre você") acompanha remédios, água, exercício e peso; refeições só se a pessoa pedir.

## 2. Contrato da API

| Área | Rotas |
|---|---|
| Sessão | `POST /auth/register`, `login`, `social-login`, `refresh` (uso único, com rotação), `logout`, `forgot-password`, `reset-password` |
| Perfil | `GET /profile`, `PATCH /profile` (nome, fuso, meta de água, `petName`, `petSpecies`, `petDna`, altura, objetivo, peso meta, módulos, espelho do corpo, piso). O perfil devolve `coins` e `petLoadout`. |
| Hábitos | `POST /medications`, `GET /medications`, `PATCH /medications/:id/deactivate`, `POST /medications/:id/log`, `GET /medications/logs`; `POST /hydration`, `GET /hydration/daily`, `/history`; `POST /exercise`, `GET /exercise/daily`, `/history`; `POST /weight`, `GET /weight/history`; `POST /meals`, `GET /meals/daily`, `/history`, `DELETE /meals/:id` |
| Metas | `GET /goals/today` (tarefas, XP e moedas do dia), `GET /goals/history?days=` (cada dia com o detalhe das tarefas), `POST /goals/rest-day`, `GET/POST /goals`, `DELETE /goals/:id`, `GET /coins` |
| Gamificação | `GET /gamification/status`, `GET /dashboard/summary` |
| Pet com IA | `GET /pets/capabilities` → `{ aiGeneration }`; `POST /pets/generate` `{ species, description }` → `{ look, suggestedName }` (5/hora e 15/dia por perfil) |
| Loja | `GET /shop` → `{ coins, items[], loadout }`; `POST /shop/items/:id/buy` (cobra e entrega na mesma transação; 409 se já tem); `PUT /shop/loadout` `{ category, itemId \| null }` |
| Dados | `GET /users/export` |

Códigos de erro para o app agir: `TARGET_BELOW_FLOOR` (com o piso em `details`), `AI_UNAVAILABLE` (503), `AI_RATE_LIMIT` (429), `AI_REJECTED` (422), `AI_FAILED` (502).

## 3. DNA do pet (v1)

Salvo em `profile.petDna`; a espécie vem de `profile.petSpecies`.

```json
{
  "v": 1,
  "bodyType": "sitting | standing | upright | fish | tall | bunny",
  "primaryColor": "#E8A55C",
  "secondaryColor": "#F8E3C4",
  "pattern": "none | spots | stripes | belly",
  "earType": "none | pointy | floppy | round | horns | long",
  "eyeType": "round | happy | sparkle | lashes | dots | wink",
  "mouthType": "smile | open | kitty",
  "accessory": "bow | glasses | hat | scarf | null",
  "seed": 123456
}
```

Espécies desenhadas: `CAT`, `DOG`, `OTTER`, `FISH`, `GIRAFFE` e `RABBIT`. Todas no estilo "pelúcia macia": camadas de cor sem contorno, volume por uma meia-lua mais escura embaixo à direita e um brilho no alto à esquerda, olhos com duas luzes, bochechas em duas camadas e sombra suave no chão. O coelho veste só o que o jogador comprar (roupa é da loja). `HAMSTER` o servidor aceita, o app ainda não desenha. Acessórios abrem por nível ou sequência. O app lê o DNA com tolerância (campo ausente ou desconhecido vira o padrão).

Itens da loja ficam fora do DNA, em `profile.petLoadout` (`{ "HAIR": "hair_bun", ... }`); o catálogo e os preços moram em `src/modules/shop/shop.catalog.ts`, e o app desenha cada item pelo `id` (id desconhecido não desenha nada).

## 4. Configuração (variáveis de ambiente)

| Variável | Para quê |
|---|---|
| `DATABASE_URL`, `JWT_SECRET` | Obrigatórias. **Use um `JWT_SECRET` forte em produção.** |
| `ANTHROPIC_API_KEY` | Liga "Criar com IA" (modelo `claude-haiku-5-5`, saída estruturada). Sem ela o app segue normal e a opção some. |
| `PET_AI_MODEL` | Opcional: troca o modelo do gerador. |
| `SMTP_*` | Envio do código de recuperação de senha. |

O servidor valida tudo que volta do modelo (cores `#RRGGBB`, enumerações, nome sem símbolos; corpo escuro demais é clareado para os olhos aparecerem) antes de entregar ao app.

## 5. Como rodar e testar

```bash
npx prisma migrate deploy        # aplica as migrations
npx nest build && node dist/main # sobe em :3000 (prefixo /api/v1)
npx jest                         # unitários
DATABASE_URL=... npx jest --config ./test/jest-e2e.json --runInBand --forceExit   # e2e, precisa de Postgres
```

App (em `health_flutter`): `flutter test`, `flutter analyze`, `flutter build apk --debug`. O endereço da API vem de `--dart-define=API_URL=...`; o padrão no emulador Android é `http://10.0.2.2:3000/api/v1`. **Build de release exige HTTPS** (o Android bloqueia HTTP puro fora de debug).

## 6. O que ainda não existe

- Login Google/Apple no app (o endpoint `social-login` existe; falta ligar os SDKs e as chaves).
- Build iOS (precisa de Mac ou serviço de build na nuvem).
- Rota para a pessoa apagar a própria conta (necessária para publicar nas lojas).
- Espécie `HAMSTER` no desenho. Os enfeites da loja (cabelo, roupa) ainda são chapados, sem o volume da pelúcia.
- Limite de uso da IA é em memória (por instância do servidor).
