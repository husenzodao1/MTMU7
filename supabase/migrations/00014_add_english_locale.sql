-- Add English locale support to user_settings
ALTER TABLE public.user_settings
  DROP CONSTRAINT user_settings_locale_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_locale_check CHECK (locale IN ('tg', 'ru', 'en'));
