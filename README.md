# Bolão Copa 2026 🏆

Plataforma de bolão para a Copa do Mundo 2026 com estilo pixel art, atualização de dados em tempo real e ranking automático.

## 🚀 Como usar

1. Acesse via GitHub Pages (link do repositório)
2. Na primeira visita, escolha um **nick** único
3. Preencha seus **palpites** antes de cada jogo começar
4. Acompanhe o **ranking** em tempo real!

## 🎯 Pontuação

| Acerto | Pontos |
|--------|--------|
| ✅ Placar exato | **3 pontos** |
| 🟡 Resultado certo | **1 ponto** |
| 🏆 Campeão correto | **+5 bônus** |

## ⚙️ Configuração (Admin)

### 1. Banco de Dados (Supabase)
Execute o script `supabase_setup.sql` no **SQL Editor** do Supabase:
- Acesse: https://ehngxartzdjpdkcekymd.supabase.co
- Vá em **SQL Editor** → **New Query**
- Cole o conteúdo de `supabase_setup.sql` e execute

### 2. GitHub Pages
1. Faça push deste repositório para o GitHub
2. Vá em **Settings → Pages**
3. Selecione **Branch: main** e pasta raiz `/`
4. Acesse a URL gerada pelo GitHub Pages

## 📁 Estrutura de Arquivos

```
├── index.html          # App principal (SPA)
├── style.css           # Design pixel art
├── app.js              # Lógica principal
├── api.js              # Cliente da API worldcup26.ir
├── supabase-client.js  # Cliente Supabase + Realtime
├── scoring.js          # Sistema de pontuação
└── supabase_setup.sql  # Script de setup do banco
```

## 🌐 Fontes de Dados

- **API de jogos**: [worldcup26.ir](https://worldcup26.ir/api-docs/) — gratuita, sem chave
- **Banco de dados**: Supabase (palpites + usuários + ranking)
- **Realtime**: Supabase Realtime para ranking instantâneo

---

Feito com ⚽ para o bolão do Dominaria!
