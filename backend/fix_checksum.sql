-- Fix checksum mismatch for previously modified migration
UPDATE "_prisma_migrations"
SET checksum = '97470011460e3c42407d98b521907b94915d2a83a5aba04176a865e2ed634f57'
WHERE migration_name = '20260601172219_add_cart_tag_and_multi_user';
