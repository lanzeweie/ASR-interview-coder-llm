import logging
import sys
import os
from typing import Optional

# ANSI Colors for professional console output
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DEBUG = "\033[36m"    # Cyan
    INFO = "\033[32m"     # Green
    WARNING = "\033[33m"  # Yellow
    ERROR = "\033[31m"    # Red
    CRITICAL = "\033[41m" # Red Background

class ColoredFormatter(logging.Formatter):
    """A custom formatter to add colors to the log levels."""
    
    FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    
    LEVEL_COLORS = {
        logging.DEBUG: Colors.DEBUG,
        logging.INFO: Colors.INFO,
        logging.WARNING: Colors.WARNING,
        logging.ERROR: Colors.ERROR,
        logging.CRITICAL: Colors.CRITICAL
    }

    def format(self, record):
        color = self.LEVEL_COLORS.get(record.levelno, Colors.RESET)
        
        # Save original levelname to restore later
        original_levelname = record.levelname
        
        # Apply color to levelname
        record.levelname = f"{color}{original_levelname}{Colors.RESET}"
        
        # Format the message
        result = super().format(record)
        
        # Restore original levelname (for other handlers etc)
        record.levelname = original_levelname
        
        return result

# Registry to keep track of configured loggers
_configured_loggers = []

def setup_logger(name: str = "AST", level: int = logging.INFO, log_file: Optional[str] = None):
    """
    Configures and returns a logger instance.
    
    Args:
        name: Name of the logger (usually __name__).
        level: Logging level (default: logging.INFO).
        log_file: Optional path to a log file.
    
    Returns:
        logging.Logger: Configured logger instance.
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid adding handlers multiple times if logger is already configured
    if logger.handlers:
        # Just update the level if it's already configured and return
        if logger not in _configured_loggers:
             _configured_loggers.append(logger)
        return logger

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_formatter = ColoredFormatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s", datefmt="%H:%M:%S")
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # File Handler (Optional)
    if log_file:
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            file_handler = logging.FileHandler(log_file, encoding='utf-8')
            file_handler.setLevel(level)
            file_formatter = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
        except Exception as e:
            # Fallback to console if file handling fails
            print(f"{Colors.WARNING}Failed to setup file handler for {log_file}: {e}{Colors.RESET}")

    _configured_loggers.append(logger)
    return logger

def set_global_log_level(level: int):
    """
    Updates the log level for all configured loggers.
    """
    for logger in _configured_loggers:
        logger.setLevel(level)
        for handler in logger.handlers:
            handler.setLevel(level)




# Create a default logger for quick imports if needed, 
# though it's better to call setup_logger(__name__) in each module.
# Check for a "logs" directory or "output" directory for file logging
_default_log_dir = "logs"
if not os.path.exists(_default_log_dir):
    try:
        os.makedirs(_default_log_dir, exist_ok=True)
    except:
        _default_log_dir = "."

# Global configuration can be set here if needed
