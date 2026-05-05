import resource
import sys
import time
import threading

def memory_limit(free_gb=5):
    """Limit max memory usage to keep a fixed amount of free memory.

    Args:
        free_gb: Amount of memory to keep free in GB (default: 5)
    """
    soft, hard = resource.getrlimit(resource.RLIMIT_AS)
    free_memory_kb = get_memory()
    # Calculate limit: total available - desired free amount
    # Convert free_gb to KiB, then to bytes
    free_bytes_to_keep = free_gb * (1024 ** 3)
    available_bytes = free_memory_kb * 1024
    limit_bytes = int(available_bytes - free_bytes_to_keep)

    if limit_bytes > 0:
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, hard))
        limit_gb = limit_bytes / (1024 ** 3)
        print(f"Memory limit set to {limit_gb:.2f} GB (keeping {free_gb} GB free)")
    else:
        print(f"Warning: Not enough memory to keep {free_gb} GB free. Available: {available_bytes / (1024**3):.2f} GB")

def get_memory():
    with open('/proc/meminfo', 'r') as mem:
        free_memory = 0
        for i in mem:
            sline = i.split()
            if str(sline[0]) in ('MemFree:', 'Buffers:', 'Cached:'):
                free_memory += int(sline[1])
    return free_memory  # KiB

def monitor_and_relimit(interval=60, free_gb=5):
    """Monitor free RAM and relimit periodically.

    Args:
        interval: Check interval in seconds (default: 60)
        free_gb: Amount of memory to keep free in GB (default: 5)
    """
    while True:
        time.sleep(interval)
        free_memory_kb = get_memory()
        free_memory_gb = free_memory_kb / (1024 ** 2)
        print(f"\n[Monitor] Free memory: {free_memory_gb:.2f} GB")
        memory_limit(free_gb)

def start_monitoring(interval=60, free_gb=5):
    """Start memory monitoring in a background thread.

    Args:
        interval: Check interval in seconds (default: 60)
        free_gb: Amount of memory to keep free in GB (default: 5)
    """
    monitor_thread = threading.Thread(target=monitor_and_relimit, args=(interval, free_gb), daemon=True)
    monitor_thread.start()
    print(f"Memory monitoring started (checking every {interval} seconds, keeping {free_gb} GB free)")

if __name__ == '__main__':
    memory_limit(free_gb=5)
    try:
        free_memory_kb = get_memory()
        free_memory_gb = free_memory_kb / (1024 ** 2)
        print(f'Available memory: {free_memory_gb:.2f} GB ({free_memory_kb} KiB)')

        # Start monitoring with 60 second interval, keeping 5GB free
        start_monitoring(interval=60, free_gb=5)

        # Keep the program running to see monitoring in action
        print("\nMonitoring active. Press Ctrl+C to exit.")
        while True:
            time.sleep(1)
    except MemoryError:
        sys.stderr.write('\n\nERROR: Memory Exception\n')
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped.")
        sys.exit(0)