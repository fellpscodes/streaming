CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title_id` integer NOT NULL,
	`file_path` text NOT NULL,
	`season` integer,
	`episode` integer,
	`manual` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_file_path_unique` ON `episodes` (`file_path`);--> statement-breakpoint
CREATE INDEX `episodes_title` ON `episodes` (`title_id`);--> statement-breakpoint
CREATE TABLE `library_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_folders_path_unique` ON `library_folders` (`path`);--> statement-breakpoint
CREATE TABLE `titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`year` integer,
	`category` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`review_reason` text,
	`manual` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `library_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `titles_status` ON `titles` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `titles_folder_id_source_key_unique` ON `titles` (`folder_id`,`source_key`);