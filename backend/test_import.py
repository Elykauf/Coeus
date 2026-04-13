import requests
import json

BASE_URL = "http://127.0.0.1:9001"

def test_pgn_import():
    payload = {
        "title": "Kasparov vs Deep Blue 1997 Game 1",
        "pgn": "[Event \"New York\"]\n[Date \"1997.05.03\"]\n[Result \"1-0\"]\n[White \"Garry Kasparov\"]\n[Black \"Deep Blue\"]\n\n1. Nf3 d5 2. d4 Bg4 3. c4 e6 4. Nc3 Nd7 5. cxd5 exd5 6. Qb3 Nb6 7. a4 a5 8. Ne5 Be6 9. e4 dxe4 10. d5 Bxd5 11. Nxd5 Qxd5 12. Bb5+ Ke7 13. Qc3 f6 14. Qxc7+ Ke6 15. Bd7+ Nxd7 16. Nxd7 Qxd7 17. Qc4+ Ke7 18. O-O f5 19. Bg5+ Nf6 20. Rfd1 Qc6 21. Qd4 Kf7 22. Rac1 Qe6 23. Rc7+ Be7 24. Qc5 Rhd8 25. Rxd8 Rxd8 26. h3 b6 27. Qc3 Nd5 28. Bxe7 Nxc3 29. Bxd8+ Ke8 30. bxc3 Kxd8 31. Rxg7 e3 32. fxe3 Qxe3+ 33. Kh1 f4 34. Rxh7 Qxc3 35. Rh6 Qa1+ 36. Kh2 Qxa4 37. Rxb6 Kc7 38. Rg6 Qe4 39. Rg4 a4 40. h4 a3 41. h5 a2 42. h6 a1=Q 43. h7 Qxh7+ 44. Rh4 Qxh4# 1-0"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/import-pgn", json=payload)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Success: {data['title']} imported with {len(data['analysis'])} moves.")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    test_pgn_import()
