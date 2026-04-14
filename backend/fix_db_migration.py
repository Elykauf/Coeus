import sqlite3
import json
import os

db_path = "/Users/elijah/projects/chess-analyzer/backend/chess_games.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find rows where analysis_depth is corrupted (PGN text, .png filename, or empty/junk)
# This includes the "PNG is visible in whole orange area" issue.
rows = cursor.execute("SELECT id, analysis_depth, data FROM games").fetchall()
count = 0

for row in rows:
    depth = str(row['analysis_depth'] or '')
    needs_fix = False
    
    # Identify corrupted fields: matches filename, pgn header, or move start
    if ('.png' in depth.lower() or 
        '[' in depth or 
        '1.' in depth or 
        len(depth) > 20):  # Normal depths are "Fast", "Standard", "Deep"
        needs_fix = True
        
    if needs_fix:
        # Recovery strategy
        recovered_depth = 'Standard'
        try:
            # Check the data blob (which was correctly JSON serialized before the mapping bug)
            data = json.loads(row['data'])
            blob_depth = data.get('analysis_depth')
            if blob_depth and len(blob_depth) < 20 and '.png' not in blob_depth:
                recovered_depth = blob_depth
        except:
            pass
            
        cursor.execute("UPDATE games SET analysis_depth=? WHERE id=?", (recovered_depth, row['id']))
        count += 1
        print(f"Fixed game ID {row['id']}: '{depth[:20]}...' -> '{recovered_depth}'")

conn.commit()
conn.close()
print(f"Total fixed: {count}")
