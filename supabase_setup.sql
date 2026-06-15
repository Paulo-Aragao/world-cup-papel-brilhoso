-- =============================================
-- Bolão Copa 2026 - Supabase Setup SQL
-- Execute no Supabase SQL Editor
-- =============================================

-- 1. Tabela de usuários (atualizada)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL, -- O ID de acesso (ex: leo123) usado para login
  nickname    TEXT NOT NULL,        -- O apelido de exibição (ex: Leonardo) que aparece para todos
  avatar_seed TEXT DEFAULT '',
  champion    TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de palpites
CREATE TABLE IF NOT EXISTS public.guesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  match_id    INTEGER NOT NULL,
  home_score  INTEGER,
  away_score  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, match_id)
);

-- 3. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guesses;

-- 4. RLS Policies - users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read users"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert users"
  ON public.users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update their own user"
  ON public.users FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete users"
  ON public.users FOR DELETE
  USING (true);

-- 5. RLS Policies - guesses
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read guesses"
  ON public.guesses FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert guesses"
  ON public.guesses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update guesses"
  ON public.guesses FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete guesses"
  ON public.guesses FOR DELETE
  USING (true);

-- 6. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guesses_updated_at
  BEFORE UPDATE ON public.guesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Trigger para impor limite de 24 horas para definir/alterar o campeão
CREATE OR REPLACE FUNCTION check_champion_time_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o campeão está sendo alterado e se passaram mais de 24 horas desde o cadastro do usuário
  IF NEW.champion IS DISTINCT FROM OLD.champion AND OLD.created_at < now() - INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'O prazo de 24 horas para definir ou alterar o campeão expirou!';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_champion_time_limit
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION check_champion_time_limit();

