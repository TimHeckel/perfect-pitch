ALTER TABLE accounts ADD COLUMN google_sub TEXT;

CREATE UNIQUE INDEX accounts_google_sub_idx ON accounts(google_sub);
