ALTER TABLE `users` ADD `username` varchar(32) DEFAULT 'rifki' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);