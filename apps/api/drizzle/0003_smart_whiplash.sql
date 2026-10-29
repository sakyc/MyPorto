ALTER TABLE `users` ADD `verification_method` varchar(8) DEFAULT 'totp' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pin_hash` varchar(255);