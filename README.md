# Bolão Singapura

Aplicação React/Vite para palpites do Major de CS2, com dados compartilhados pelo Supabase.

## Configuração do Supabase

1. Para o projeto Supabase já configurado, abra o **SQL Editor** e execute `supabase/migrations/20261119_normalize_teams.sql`. Ela migra os times e as rodadas selecionadas sem apagar os dados.
2. Em um projeto novo, execute `supabase/schema.sql` no **SQL Editor**.
3. Para desenvolvimento local, copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A configuração do Vite também aceita `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, como os nomes fornecidos pela integração do Vercel.
4. Execute `npm install` e `npm run dev`.
5. No primeiro acesso, os dados antigos deste navegador são migrados para o banco se ele ainda não tiver sido inicializado.
6. No Vercel, configure as mesmas variáveis em **Settings → Environment Variables** e faça um novo deploy.

As tabelas `teams` e `stage_teams` separam o cadastro global das equipes da ativação de cada equipe em cada fase. `stage_teams.is_active` indica se o time participa daquela fase. O schema mantém leitura e escrita públicas; qualquer pessoa poderá alterar os dados diretamente, e a senha do painel é apenas uma barreira visual. A configuração do Vite só mapeia a URL e as chaves públicas do Supabase, nunca as chaves secretas ou a senha do banco.

## Comandos

- `npm run dev`: inicia o servidor local.
- `npm run build`: gera os arquivos de produção na pasta `dist`.
- `npm run preview`: testa localmente o build de produção.
- `npm run lint`: executa o Oxlint.
