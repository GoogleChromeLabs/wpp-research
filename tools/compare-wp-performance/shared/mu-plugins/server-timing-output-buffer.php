<?php
/**
 * Plugin Name: Server Timing Output Buffer
 * Description: Enables output buffering in the Performance Lab plugin's Server Timing API.
 */

add_filter( 'perflab_server_timing_use_output_buffer', '__return_true' );
