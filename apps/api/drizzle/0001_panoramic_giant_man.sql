CREATE TABLE `assistant_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assistant_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(80) NOT NULL,
	`entity` varchar(80) NOT NULL,
	`entity_id` varchar(140),
	`meta` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `certificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_challenges` (
	`token_hash` char(64) NOT NULL,
	`user_id` int NOT NULL,
	`expires_at` timestamp NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	CONSTRAINT `login_challenges_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `experience` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `experience_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(100) NOT NULL,
	`mime` varchar(40) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`bytes` int NOT NULL,
	`alt` varchar(250) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_filename_unique` UNIQUE(`filename`)
);
--> statement-breakpoint
CREATE TABLE `page_views_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` char(10) NOT NULL,
	`path` varchar(200) NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`uniques` int NOT NULL DEFAULT 0,
	CONSTRAINT `page_views_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `page_day_path_idx` UNIQUE(`day`,`path`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(140) NOT NULL,
	`data` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `referrers_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` char(10) NOT NULL,
	`source` varchar(200) NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	CONSTRAINT `referrers_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `referrer_day_source_idx` UNIQUE(`day`,`source`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` char(64) NOT NULL,
	`user_id` int NOT NULL,
	`csrf_token` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int NOT NULL,
	`data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`version` int AUTO_INCREMENT NOT NULL,
	`payload` json NOT NULL,
	`commit_hash` char(12) NOT NULL,
	`summary` json NOT NULL,
	`published_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `snapshots_version` PRIMARY KEY(`version`)
);
--> statement-breakpoint
CREATE TABLE `stack_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`data` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stack_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`totp_secret` text NOT NULL,
	`last_totp_step` int NOT NULL DEFAULT 0,
	`failed_logins` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `visitors_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` char(10) NOT NULL,
	`visitor_hash` char(64) NOT NULL,
	`path` varchar(200) NOT NULL,
	CONSTRAINT `visitors_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `visitor_day_hash_path_idx` UNIQUE(`day`,`visitor_hash`,`path`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `ip_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `login_challenges` ADD CONSTRAINT `login_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);