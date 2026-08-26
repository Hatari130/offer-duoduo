\set ON_ERROR_STOP on
\getenv new_password OFFERFLOW_NEW_DB_PASSWORD

SELECT format('ALTER ROLE offerflow_app PASSWORD %L', :'new_password') \gexec
