-- Create plans table for renovation ideas and designs
CREATE TABLE IF NOT EXISTS plans (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    room VARCHAR(100),
    image_url TEXT,
    storage_path TEXT, -- Path to file in Supabase Storage
    source_url TEXT,
    tags TEXT[], -- Array of tags for categorization
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create rooms table (optional, for reference)
CREATE TABLE IF NOT EXISTS rooms (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default rooms
INSERT INTO rooms (name, description) VALUES
    ('Living Room', 'Main living space'),
    ('Kitchen', 'Kitchen area'),
    ('Bedroom 1', 'Master bedroom'),
    ('Bedroom 2', 'Second bedroom'),
    ('Bedroom 3', 'Third bedroom'),
    ('Bathroom 1', 'Main bathroom'),
    ('Bathroom 2', 'Second bathroom'),
    ('Hallway', 'Entrance and hallway'),
    ('Other', 'Other spaces')
ON CONFLICT (name) DO NOTHING;

-- Create index for faster room filtering
CREATE INDEX IF NOT EXISTS idx_plans_room ON plans(room);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at DESC);

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now - adjust based on your security needs)
-- For public read access:
CREATE POLICY "Allow public read access" ON plans FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON rooms FOR SELECT USING (true);

-- For authenticated write access (if you add auth later):
-- CREATE POLICY "Allow authenticated insert" ON plans FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Allow authenticated update" ON plans FOR UPDATE USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow authenticated delete" ON plans FOR DELETE USING (auth.role() = 'authenticated');
