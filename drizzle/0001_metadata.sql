ALTER TABLE `titles` ADD `metadata_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `titles` ADD `metadata_source` text;--> statement-breakpoint
ALTER TABLE `titles` ADD `tmdb_id` integer;--> statement-breakpoint
ALTER TABLE `titles` ADD `anilist_id` integer;--> statement-breakpoint
ALTER TABLE `titles` ADD `mal_id` integer;--> statement-breakpoint
ALTER TABLE `titles` ADD `overview` text;--> statement-breakpoint
ALTER TABLE `titles` ADD `poster_url` text;--> statement-breakpoint
ALTER TABLE `titles` ADD `backdrop_url` text;--> statement-breakpoint
ALTER TABLE `titles` ADD `rating` real;--> statement-breakpoint
ALTER TABLE `titles` ADD `genres` text;--> statement-breakpoint
ALTER TABLE `titles` ADD `cast` text;