<?php
/**
 * Plugin Name: Performance Lab Disable Modules
 * Description: Disable all Performance Lab modules.
 */

add_filter( 'pre_option_perflab_modules_settings', '__return_empty_array' );
